// ~4 equal grid steps with whole numbers for a chart's y-axis
const STEPS = [1, 2, 3, 4, 5, 6, 8, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000, 2500, 3000, 5000, 10000];
export const axisStep = (max: number) => STEPS.find((s) => s * 4 >= max) ?? Math.ceil(max / 4);
