const CRISIS_PATTERNS = [
  /自杀/,
  /想死/,
  /结束生命/,
  /不想活/,
  /自残/,
  /割腕/,
  /跳楼/,
  /kill\s*myself/i,
  /want\s*to\s*die/i,
];

export function detectCrisis(text: string): boolean {
  return CRISIS_PATTERNS.some((re) => re.test(text));
}

export const CRISIS_APPENDIX =
  "\n\n——如果你现在非常难受、有伤害自己的想法，请尽快联系身边信任的人或当地紧急求助热线。Emolog 只是私人手账，不能替代专业帮助。";
