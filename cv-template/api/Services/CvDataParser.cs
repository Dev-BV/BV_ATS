using System.Globalization;
using System.Text.RegularExpressions;

namespace CvTemplate.Api.Services;

public record ParsedCv(
    string? FullName,
    string? Nic,
    string? DateOfBirth,      // yyyy-MM-dd
    string? DobSource,        // "CV" or "NIC"
    string? Phone,
    string? Location,
    string? Religion,
    string? OlEnglish,
    string? OlMaths,
    string? OlSinhala,
    string? OlTamil,
    string? OlScience,
    string? OlSummary,        // e.g. "6A 2B 1C" when only a summary is given
    string? AlResults);

public interface ICvDataParser
{
    ParsedCv Parse(string text);
}

public class CvDataParser : ICvDataParser
{
    private const RegexOptions Ci = RegexOptions.IgnoreCase | RegexOptions.Compiled;
    private const RegexOptions CiMl = RegexOptions.IgnoreCase | RegexOptions.Multiline | RegexOptions.Compiled;

    // =====================================================================
    //  Regexes
    // =====================================================================

    // NIC (Sri Lanka): old = 9 digits + V/X, new = 12 digits
    private static readonly Regex NicRegex =
        new(@"(?<![\dA-Za-z])(\d{9}[VvXx]|\d{12})(?![\dA-Za-z])", RegexOptions.Compiled);

    // Phone: prefix (+94 / (+94) / 0094 / 0) + exactly 9 digits, any grouping
    private static readonly Regex PhoneRegex = new(
        @"(?<![\d+])(?:\(?\+94\)?|0094|0)[ \t\-\.]*\(?[1-9]\)?(?:[ \t\-\.]*\d){8}(?!\d)", RegexOptions.Compiled);

    private static readonly Regex ReferenceHeading = new(@"^\s*(?:personal\s+)?references?\s*$", CiMl);
    private static readonly Regex NameLabelRegex = new(@"^\s*(?:full\s+name|name)\s*[:\-]\s*(.+)$", CiMl);
    private static readonly Regex EmailRegex = new(@"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}", RegexOptions.Compiled);
    private static readonly Regex LinkedInRegex = new(@"linkedin\.com/in/([A-Za-z0-9\-_%]+)", Ci);

    private static readonly Regex TitleWordRegex = new(
        @"\b(engineer|developer|intern|manager|designer|analyst|consultant|officer|executive|trainee|architect|administrator|programmer|tester|accountant|coordinator|specialist|director)\b", Ci);

    // Date of birth
    private static readonly Regex DobLabel = new(
        @"(?:date\s+of\s+birth|\bd\.?\s?o\.?\s?b\b\.?|birth\s*date|\bborn\b|birthday)", Ci);
    private static readonly Regex DateNumeric = new(
        @"(?<!\d)(\d{1,2})\s*[/\-\.]\s*(\d{1,2})\s*[/\-\.]\s*(\d{4})(?!\d)", RegexOptions.Compiled);
    private static readonly Regex DateIso = new(
        @"(?<!\d)(\d{4})\s*[/\-\.]\s*(\d{1,2})\s*[/\-\.]\s*(\d{1,2})(?!\d)", RegexOptions.Compiled);
    private static readonly Regex DateDayMonthName = new(
        @"(?<!\d)(\d{1,2})(?:st|nd|rd|th)?\s*(?:of\s+)?([A-Za-z]{3,9})\.?,?\s*(\d{4})(?!\d)", Ci);
    private static readonly Regex DateMonthNameDay = new(
        @"\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})(?!\d)", Ci);
    private static readonly string[] Months =
        { "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec" };

    // Religion
    private static readonly Regex ReligionLabel = new(@"^\s*religion\s*[:\-–]?\s*(.*)$", Ci);
    private static readonly Regex ReligionWord = new(
        @"\b(buddhis[mt]|roman\s+catholic|catholic(?:ism)?|christian(?:ity)?|hindu(?:ism)?|islam(?:ic)?|muslim|methodist|anglican)\b", Ci);

    // Address / residence
    private static readonly Regex AddressLabel = new(
        @"^\s*(?:(?:current|permanent|residential|home|postal|mailing)\s+)?(?:address|residence|location|place\s+of\s+residence)(?:\s*[:\-–]\s*(?<rest>.+?))?\s*$", Ci);

    // Education
    private static readonly Regex OlHeading = new(@"\bO\s*/\s*Ls?\b|\bO\.\s?L\b|Ordinary\s+Levels?", Ci);
    private static readonly Regex AlHeading = new(@"\bA\s*/\s*Ls?\b|\bA\.\s?L\b|Advanced\s+Levels?", Ci);
    private static readonly Regex SectionBreak = new(
        @"^(?:work\s+experience|experience|employment|skills|technical\s+skills|projects|undergraduate\s+projects|references?|personal\s+references|declaration|interests?|hobbies|languages?|personal\s+projects|certifications.*)\s*$", Ci);

    // Grade summaries such as "6A 2B 1C", "3A", "2A's & C"
    private static readonly Regex GradeSummary = new(
        @"(?<![\w/])(?<first>\d[ABCS](?:['’]s)?)(?:(?:[ ,&]|\band\b)+(?:\d)?[ABCS](?:['’]s)?)*(?![\w/])", RegexOptions.Compiled);
    private static readonly Regex GradeUnit = new(@"(\d)?([ABCS])(?:['’]s)?", RegexOptions.Compiled);
    private static readonly Regex AlLetterGrades = new(
        @"(?:results?|A\s*/\s*L|Advanced\s+Level)\s*[:\-–]\s*([ABCSF]{3})\b", Ci);

    private const string GradeTail =
        @"[ \t]*[\(\[]?[ \t:\-–—=\.\|]*(?:\n[ \t]*)?[\(\[]?(?-i:(?<g>[ABCSFW]))[\)\]]?(?![A-Za-z])(?=[ \t]*(?:$|[,;|&\)\]\.]|[A-Z0-9]))";
    private const string SubjectLead = @"(?<![A-Za-z])(?<!computer\s)(?<!physical\s)(?<!political\s)(?<!combined\s)(?<!general\s)";

    private static readonly (string Key, Regex Rx)[] OlSubjects =
    {
        ("English", new Regex(SubjectLead + @"english(?:\s+language)?" + GradeTail, CiMl)),
        ("Maths",   new Regex(SubjectLead + @"(?:mathematics|maths?)" + GradeTail, CiMl)),
        ("Sinhala", new Regex(SubjectLead + @"sinhala(?:\s+language)?(?:\s*(?:&|and)\s*literature)?" + GradeTail, CiMl)),
        ("Tamil",   new Regex(SubjectLead + @"tamil(?:\s+language)?(?:\s*(?:&|and)\s*literature)?" + GradeTail, CiMl)),
        ("Science", new Regex(SubjectLead + @"science(?:\s*(?:&|and)\s*technology)?" + GradeTail, CiMl)),
    };

    // A/L subjects (used with an explicit separator so skills lists don't match)
    private static readonly Regex AlSubjectGrade = new(
        @"(?<![A-Za-z])(?<s>combined\s+math(?:s|ematics)|higher\s+mathematics|physics|chemistry|biology|bio\s*science|accounting|accountancy|business\s+studies|business\s+statistics|economics|geography|agricultural\s+science|science\s+for\s+technology|engineering\s+technology|general\s+information\s+technology|information\s+(?:and\s+communication\s+)?technology|ict|git)"
        + @"(?:[ \t]*\([A-Za-z ]{2,12}\))?[ \t]*(?:[:\-–—=]|\()[ \t]*(?-i:(?<g>[ABCSFW]))[\)\]]?(?![A-Za-z])", CiMl);

    private static readonly HashSet<string> NamePrefixes = new(StringComparer.OrdinalIgnoreCase)
        { "mr", "mrs", "ms", "miss", "dr", "prof", "eng", "rev", "hon" };

    private static readonly HashSet<string> Particles = new(StringComparer.OrdinalIgnoreCase)
        { "de", "da", "van", "von", "bin", "binti", "al", "la", "di", "del" };

    private static readonly string[] TitleWords =
        { "engineer", "developer", "intern", "manager", "designer", "analyst", "consultant", "officer",
          "executive", "trainee", "architect", "administrator", "programmer", "tester", "accountant" };

    // Words that never appear in a person's name (section headings, job titles, tech, places...)
    private static readonly HashSet<string> NotNameWords = new(StringComparer.OrdinalIgnoreCase)
    {
        "curriculum","vitae","resume","cv","profile","summary","objective","contact","me","address","email","phone",
        "mobile","education","educational","experience","work","personal","background","projects","project",
        "undergraduate","qualifications","qualification","professional","interests","interest","soft","skills","skill",
        "tools","technical","technology","technologies","exposure","language","languages","references","reference",
        "certifications","certification","achievements","awards","competitions","organizations","organisation",
        "volunteers","volunteer","sports","hobbies","declaration","details","information","academic","expertise",
        "software","engineer","engineering","developer","development","manager","intern","associate","senior","junior",
        "designer","analyst","consultant","officer","executive","trainee","assistant","architect","administrator",
        "programmer","tester","accountant","coordinator","specialist","director","lecturer","head",
        "web","services","service","design","system","systems","science","computer","bachelor","master","diploma",
        "degree","hons","beng","bsc","msc","level","java","python","react","angular","linux","git","sql","mysql",
        "english","sinhala","tamil","social","travelling","music","chess","movies","teamwork","leadership",
        "communication","university","institute","college","school","hospital","bank","limited","company","group",
        "solutions","pvt","ltd","sri","lanka","colombo","road","street","lane","society","club","member","team",
        "captain","champion","present","page","about","general","primary","secondary","advanced","ordinary",
        "religion","nationality","gender","birth","date","civil","status","marital","citizenship"
    };

    // =====================================================================
    //  Entry point
    // =====================================================================

    public ParsedCv Parse(string text)
    {
        if (string.IsNullOrWhiteSpace(text))
            return new ParsedCv(null, null, null, null, null, null, null, null, null, null, null, null, null, null);

        var nicMatch = NicRegex.Match(text);
        var nic = nicMatch.Success ? nicMatch.Value.ToUpperInvariant() : null;
        var withoutNic = NicRegex.Replace(text, " ");

        var lines = text.Split('\n').Select(Clean).Where(l => l.Length > 0).ToList();

        var (name, nameIdx) = FindName(text, lines);

        // Date of birth: explicit label first, otherwise decode it from the NIC
        var dob = FindDobInCv(lines);
        string? dobSource = dob is null ? null : "CV";
        if (dob is null && nic is not null)
        {
            dob = DobFromNic(nic);
            if (dob is not null) dobSource = "NIC";
        }

        var ol = FindOLevel(lines);
        ol.TryGetValue("English", out var en);
        ol.TryGetValue("Maths", out var ma);
        ol.TryGetValue("Sinhala", out var si);
        ol.TryGetValue("Tamil", out var ta);
        ol.TryGetValue("Science", out var sc);

        var (olSummary, alSummary) = FindGradeSummaries(lines);

        return new ParsedCv(
            TidyName(name), nic, dob, dobSource,
            FindPhone(withoutNic),
            FindLocation(lines, nameIdx),
            FindReligion(lines),
            en, ma, si, ta, sc, olSummary,
            FindALevel(lines, alSummary));
    }

    // =====================================================================
    //  Phone
    // =====================================================================

    private static string? FindPhone(string text)
    {
        // Prefer numbers before the "References" section
        var refHeading = ReferenceHeading.Match(text);
        var head = refHeading.Success ? text[..refHeading.Index] : text;

        var all = PhoneRegex.Matches(head).Cast<Match>().ToList();
        if (all.Count == 0) all = PhoneRegex.Matches(text).Cast<Match>().ToList();
        if (all.Count == 0) return null;

        string Normalise(Match m)
        {
            var digits = new string(m.Value.Where(char.IsDigit).ToArray());
            return "0" + digits[^9..];
        }

        // Contact *mobile* number: prefer 07x numbers, otherwise the first number found
        var numbers = all.Select(Normalise).ToList();
        return numbers.FirstOrDefault(n => n.StartsWith("07")) ?? numbers[0];
    }

    // =====================================================================
    //  Date of birth
    // =====================================================================

    private static string? FindDobInCv(List<string> lines)
    {
        for (int i = 0; i < lines.Count; i++)
        {
            var m = DobLabel.Match(lines[i]);
            if (!m.Success) continue;

            // Same line (after the label), then next line, then previous line (label-after-value layouts)
            var rest = lines[i][(m.Index + m.Length)..];
            var tries = new List<string> { rest };
            if (i + 1 < lines.Count) tries.Add(lines[i + 1]);
            if (i > 0) tries.Add(lines[i - 1]);

            foreach (var t in tries)
            {
                var d = ParseDate(t);
                if (d is not null) return d;
            }
        }
        return null;
    }

    private static string? ParseDate(string s)
    {
        DateTime? Make(int y, int m, int d)
        {
            if (y < 1930 || y > DateTime.UtcNow.Year - 14 || m < 1 || m > 12 || d < 1 || d > DateTime.DaysInMonth(y, m)) return null;
            return new DateTime(y, m, d);
        }

        int MonthFromName(string name)
        {
            var key = name.Length >= 3 ? name[..3].ToLowerInvariant() : name.ToLowerInvariant();
            return Array.IndexOf(Months, key) + 1;   // 0 if not a month
        }

        DateTime? dt = null;

        var iso = DateIso.Match(s);
        if (iso.Success)
            dt = Make(int.Parse(iso.Groups[1].Value), int.Parse(iso.Groups[2].Value), int.Parse(iso.Groups[3].Value));

        if (dt is null)
        {
            var n = DateNumeric.Match(s);
            if (n.Success)
            {
                int a = int.Parse(n.Groups[1].Value), b = int.Parse(n.Groups[2].Value), y = int.Parse(n.Groups[3].Value);
                dt = Make(y, b, a) ?? Make(y, a, b);   // day/month first (Sri Lanka), fall back to month/day
            }
        }

        if (dt is null)
        {
            var n = DateDayMonthName.Match(s);
            if (n.Success)
            {
                var mo = MonthFromName(n.Groups[2].Value);
                if (mo > 0) dt = Make(int.Parse(n.Groups[3].Value), mo, int.Parse(n.Groups[1].Value));
            }
        }

        if (dt is null)
        {
            var n = DateMonthNameDay.Match(s);
            if (n.Success)
            {
                var mo = MonthFromName(n.Groups[1].Value);
                if (mo > 0) dt = Make(int.Parse(n.Groups[3].Value), mo, int.Parse(n.Groups[2].Value));
            }
        }

        return dt?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
    }

    // Sri Lankan NIC encodes birth year + day-of-year (female = +500). February always has 29 days in the scheme.
    private static string? DobFromNic(string nic)
    {
        int year, days;
        if (nic.Length == 10)
        {
            year = 1900 + int.Parse(nic[..2]);
            days = int.Parse(nic.Substring(2, 3));
        }
        else
        {
            year = int.Parse(nic[..4]);
            days = int.Parse(nic.Substring(4, 3));
        }

        if (days > 500) days -= 500;
        if (year < 1930 || year > DateTime.UtcNow.Year - 14 || days < 1 || days > 366) return null;

        if (!DateTime.IsLeapYear(year))
        {
            if (days == 60) return null;     // "29 Feb" of a non-leap year does not exist
            if (days > 60) days--;
        }
        return new DateTime(year, 1, 1).AddDays(days - 1).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
    }

    // =====================================================================
    //  Religion
    // =====================================================================

    private static string? FindReligion(List<string> lines)
    {
        // 1) "Religion : Buddhist" (or value on the next / previous line)
        for (int i = 0; i < lines.Count; i++)
        {
            var m = ReligionLabel.Match(lines[i]);
            if (!m.Success) continue;

            var tries = new List<string> { m.Groups[1].Value };
            if (i + 1 < lines.Count) tries.Add(lines[i + 1]);
            if (i > 0) tries.Add(lines[i - 1]);

            foreach (var t in tries)
            {
                var w = ReligionWord.Match(t);
                if (w.Success) return CanonicalReligion(w.Value);
            }
        }

        // 2) A line that is just the religion, e.g. "Buddhist"
        foreach (var l in lines)
        {
            var w = ReligionWord.Match(l);
            if (w.Success && w.Value.Length == l.Length) return CanonicalReligion(w.Value);
        }
        return null;
    }

    private static string CanonicalReligion(string v)
    {
        v = v.ToLowerInvariant();
        if (v.StartsWith("buddh")) return "Buddhism";
        if (v.Contains("catholic")) return "Catholic";
        if (v.StartsWith("hindu")) return "Hindu";
        if (v.StartsWith("islam") || v == "muslim") return "Islam";
        return "Christian";   // christian, methodist, anglican
    }

    // =====================================================================
    //  Location (residence)
    // =====================================================================

    private static string? FindLocation(List<string> lines, int nameIdx)
    {
        // 1) "Address : ..." label (value can be on the label line, the next line, or the line before it)
        for (int i = 0; i < lines.Count; i++)
        {
            var m = AddressLabel.Match(lines[i]);
            if (!m.Success) continue;

            var rest = m.Groups["rest"].Success ? m.Groups["rest"].Value : "";
            if (rest.Length > 0) return JoinAddress(lines, i, rest, true);

            if (i + 1 < lines.Count && LooksLikeAddress(lines[i + 1]))
                return JoinAddress(lines, i + 1, lines[i + 1], true);
            if (i > 0 && LooksLikeAddress(lines[i - 1]))
                return JoinAddress(lines, i - 1, lines[i - 1], false);
        }

        // 2) No label: a short, capitalised, comma-separated line near the contact details or right after the name
        //    (e.g. "Nisansala, Kandegoda,")
        var contactIdx = Enumerable.Range(0, lines.Count)
            .Where(i => lines[i].Contains('@') ||
                        lines[i].Contains("linkedin", StringComparison.OrdinalIgnoreCase) ||
                        lines[i].Contains("github", StringComparison.OrdinalIgnoreCase)).ToList();
        var refStart = Enumerable.Range(0, lines.Count).FirstOrDefault(i => ReferenceHeading.IsMatch(lines[i]), lines.Count);

        for (int k = 0; k < Math.Min(refStart, lines.Count); k++)
        {
            var l = lines[k];
            bool near = contactIdx.Any(c => Math.Abs(c - k) <= 8) || (nameIdx >= 0 && k > nameIdx && k <= nameIdx + 4);
            if (!near) continue;
            if (l.Length <= 50 && l.Contains(',') && !l.Contains('(') && !IsTitleLine(l) &&
                LooksLikeAddress(l) && MostlyCapitalised(l))
                return JoinAddress(lines, k, l, true);
        }
        return null;
    }

    private static string? JoinAddress(List<string> lines, int idx, string first, bool allowContinuation)
    {
        var value = first;
        int next = idx + 1;
        // an address wrapped over several lines ends with a comma on every line but the last
        while (allowContinuation && value.EndsWith(',') && next < lines.Count && value.Length < 100 &&
               !IsContactLine(lines[next]) && !AddressLabel.IsMatch(lines[next]))
        {
            value += " " + lines[next];
            next++;
        }
        value = value.Replace("“", "").Replace("”", "").Replace("\"", "");
        value = Regex.Replace(value, @"\s+,", ",");
        value = Clean(value).TrimEnd(',', ' ');
        return value.Length >= 3 ? value : null;
    }

    private static bool IsContactLine(string l) =>
        l.Contains('@') || l.Contains("http", StringComparison.OrdinalIgnoreCase) ||
        l.Contains("linkedin", StringComparison.OrdinalIgnoreCase) || l.Contains("github", StringComparison.OrdinalIgnoreCase) ||
        PhoneRegex.IsMatch(l);

    private static bool LooksLikeAddress(string l)
    {
        if (l.Length < 6 || l.Length > 120 || IsContactLine(l)) return false;
        if (l.EndsWith(':')) return false;
        if (ReligionWord.IsMatch(l)) return false;
        return l.Contains(',') || char.IsDigit(l[0]) ||
               Regex.IsMatch(l, @"\b(road|rd|street|st|lane|mawatha|place|avenue|garden|gardens)\b", RegexOptions.IgnoreCase);
    }

    private static bool MostlyCapitalised(string l)
    {
        var words = l.Split(' ', StringSplitOptions.RemoveEmptyEntries)
                     .Select(w => w.Trim('“', '”', '"', ',', '.', ' '))
                     .Where(w => w.Length > 0).ToList();
        return words.Count > 0 && words.Count(w => char.IsUpper(w[0]) || char.IsDigit(w[0])) >= 0.7 * words.Count;
    }

    // =====================================================================
    //  GCE O/L and A/L results
    // =====================================================================

    // Lines belonging to a results section that starts at "idx" (stops at the other level's heading or a new section)
    private static string Region(List<string> lines, int idx, Regex otherHeading)
    {
        var parts = new List<string> { lines[idx] };
        for (int i = idx + 1; i < lines.Count && i <= idx + 15; i++)
        {
            if (otherHeading.IsMatch(lines[i]) || SectionBreak.IsMatch(lines[i])) break;
            parts.Add(lines[i]);
        }
        return string.Join("\n", parts);
    }

    private static Dictionary<string, string> FindOLevel(List<string> lines)
    {
        var result = new Dictionary<string, string>();
        var headings = Enumerable.Range(0, lines.Count).Where(i => OlHeading.IsMatch(lines[i])).ToList();

        foreach (var h in headings)
        {
            var region = Region(lines, h, AlHeading);
            foreach (var (key, rx) in OlSubjects)
            {
                if (result.ContainsKey(key)) continue;
                var m = rx.Match(region);
                if (m.Success) result[key] = m.Groups["g"].Value.ToUpperInvariant();
            }
        }
        return result;
    }

    // Splits "6A 2B 1C" (9 subjects -> O/L) from "2A's & C" / "1B 2C" (3 subjects -> A/L)
    private static (string? Ol, string? Al) FindGradeSummaries(List<string> lines)
    {
        string? ol = null, al = null;

        for (int i = 0; i < lines.Count; i++)
        {
            foreach (Match m in GradeSummary.Matches(lines[i]))
            {
                var units = GradeUnit.Matches(m.Value);
                int total = units.Cast<Match>().Sum(u => u.Groups[1].Success ? int.Parse(u.Groups[1].Value) : 1);

                var context = string.Join(" ", lines.Skip(Math.Max(0, i - 3)).Take(7));
                bool alContext = AlHeading.IsMatch(lines[i]) ||
                    Regex.IsMatch(lines[i], @"stream|combined|physical|biological|commerce|maths|arts|technology", RegexOptions.IgnoreCase);
                bool olContext = OlHeading.IsMatch(lines[i]);

                var value = Clean(m.Value);

                if (total is >= 7 and <= 10 && (units.Count >= 2 || olContext))
                    ol ??= value;
                else if (total is >= 1 and <= 4 && ((units.Count >= 2 && total == 3) || alContext))
                    al ??= value;
            }
        }
        return (ol, al);
    }

    private static string? FindALevel(List<string> lines, string? summary)
    {
        var parts = new List<string>();
        if (summary is not null) parts.Add(summary);

        // Subject-by-subject grades:  "Combined Mathematics - A", "General Information Technology (GIT) - A"
        var pairs = new List<string>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (Match m in AlSubjectGrade.Matches(string.Join("\n", lines)))
        {
            var subject = CultureInfo.InvariantCulture.TextInfo.ToTitleCase(Clean(m.Groups["s"].Value).ToLowerInvariant());
            if (subject.Equals("Ict", StringComparison.Ordinal)) subject = "ICT";
            if (subject.Equals("Git", StringComparison.Ordinal)) subject = "GIT";
            if (seen.Add(subject)) pairs.Add($"{subject}: {m.Groups["g"].Value.ToUpperInvariant()}");
        }
        if (pairs.Count > 0) parts.Add(string.Join(", ", pairs));

        // "A/L : ABB"
        if (parts.Count == 0)
        {
            var letters = AlLetterGrades.Match(string.Join("\n", lines));
            if (letters.Success) parts.Add(letters.Groups[1].Value.ToUpperInvariant());
        }

        return parts.Count > 0 ? string.Join("; ", parts) : null;
    }

    // =====================================================================
    //  Name
    // =====================================================================

    private static string? TidyName(string? name)
    {
        if (name is null) return null;
        return name == name.ToUpperInvariant()
            ? CultureInfo.InvariantCulture.TextInfo.ToTitleCase(name.ToLowerInvariant())
            : name;
    }

    private static (string? Name, int Idx) FindName(string text, List<string> lines)
    {
        // 1) Explicit "Name: ..." label
        var labelled = NameLabelRegex.Match(text);
        if (labelled.Success)
        {
            var value = Clean(labelled.Groups[1].Value);
            if (IsNameLine(value))
            {
                var at = lines.FindIndex(l => l.Contains(value));
                return (value, at);
            }
        }

        var hint = BuildHint(text);
        var refIdx = Enumerable.Range(0, lines.Count).Where(i => ReferenceHeading.IsMatch(lines[i])).ToList();
        var candidates = new List<(string Name, int Idx, int Last, double Score)>();

        for (int i = 0; i < lines.Count; i++)
        {
            if (IsNameLine(lines[i]))
                candidates.Add((lines[i], i, i, Score(lines[i], i, i - 1, i + 1, lines, hint, refIdx)));

            // Name split over two lines: "MAHIDI" / "WIJAYANTHA"
            if (i + 1 < lines.Count && IsSingleNameWord(lines[i]) && IsSingleNameWord(lines[i + 1]))
            {
                var merged = lines[i] + " " + lines[i + 1];
                candidates.Add((merged, i, i + 1, Score(merged, i, i - 1, i + 2, lines, hint, refIdx)));
            }
        }

        if (candidates.Count == 0) return (null, -1);

        var best = candidates.OrderByDescending(c => c.Score).ThenBy(c => c.Idx).First();
        // Without any supporting signal, only trust lines at the very top of the CV
        return best.Score >= 3 || best.Idx < 8 ? (best.Name, best.Last) : (null, -1);
    }

    private static double Score(string name, int idx, int prevIdx, int nextIdx,
                                List<string> lines, string hint, List<int> refIdx)
    {
        double s = 0;

        var tokens = name.ToLowerInvariant().Split(' ')
                         .Select(t => Regex.Replace(t, "[^a-z]", ""))
                         .Where(t => t.Length >= 4);
        if (hint.Length > 0 && tokens.Any(t => hint.Contains(t))) s += 5;

        if ((prevIdx >= 0 && IsTitleLine(lines[prevIdx])) ||
            (nextIdx < lines.Count && IsTitleLine(lines[nextIdx]))) s += 3;

        if (idx < 15) s += 1;
        if (refIdx.Any(r => idx > r && idx - r <= 12)) s -= 4;

        return s;
    }

    private static string BuildHint(string text)
    {
        var joined = Regex.Replace(text, @"-\s*\n\s*", "-");
        var parts = new List<string>();

        var email = EmailRegex.Match(joined);
        if (email.Success) parts.Add(email.Value.Split('@')[0]);
        foreach (Match m in LinkedInRegex.Matches(joined)) parts.Add(m.Groups[1].Value);

        return Regex.Replace(string.Join(" ", parts).ToLowerInvariant(), "[^a-z]", "");
    }

    private static bool IsTitleLine(string line)
    {
        if (TitleWordRegex.IsMatch(line)) return true;

        // Letter-spaced text like "A s s o c i a t e  S o f t w a r e  E n g i n e e r"
        var tokens = line.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (tokens.Count(t => t.Length == 1) >= 5)
        {
            var collapsed = string.Concat(tokens).ToLowerInvariant();
            return TitleWords.Any(collapsed.Contains);
        }
        return false;
    }

    private static bool IsNameLine(string line)
    {
        if (line.Length is < 5 or > 50) return false;
        if (line.Any(c => char.IsDigit(c) || "@:,/|()&_#+*<>[]{}=%\"“”".Contains(c))) return false;

        var words = line.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (words.Length is < 2 or > 5) return false;
        if (NamePrefixes.Contains(words[0].TrimEnd('.'))) return false;

        foreach (var w in words)
        {
            var bare = w.Trim('.', '\'', '-');
            if (NotNameWords.Contains(bare)) return false;
            if (Particles.Contains(bare)) continue;
            if (Regex.IsMatch(w, @"^\p{Lu}\.$")) continue;
            if (!Regex.IsMatch(w, @"^\p{Lu}[\p{L}\.'\-]+$") || bare.Length < 2) return false;
        }
        return true;
    }

    private static bool IsSingleNameWord(string line) =>
        Regex.IsMatch(line, @"^\p{Lu}\p{L}{2,19}$") && !NotNameWords.Contains(line);

    private static string Clean(string s) => Regex.Replace(s, @"\s+", " ").Trim();
}
