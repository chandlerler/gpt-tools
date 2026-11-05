(() => {
  // Percentage values use six decimal places so boundary decisions never
  // depend on floating-point rounding. Counts and results remain integers.
  const fullRate = 100000000n;
  const parseCount = (value, label) => {
    const text = String(value ?? "").trim();
    if (!/^\d+$/.test(text)) throw new Error(`${label}请输入非负整数。`);
    return BigInt(text);
  };
  const parseRate = (value, label) => {
    const text = String(value ?? "").trim();
    if (!/^(?:\d+(?:\.\d{1,6})?|\.\d{1,6})$/.test(text)) {
      throw new Error(`${label}请输入 0～100 的数字，最多 6 位小数。`);
    }
    const [whole, fraction = ""] = text.split(".");
    const rate = BigInt(whole || "0") * 1000000n + BigInt(fraction.padEnd(6, "0"));
    if (rate > fullRate) throw new Error(`${label}不能超过 100%。`);
    return rate;
  };
  const formatRate = (positiveScaled, total) => {
    if (total === 0n) return "暂无评价";
    const divisor = total * fullRate;
    const rounded = (positiveScaled * 1000000n + divisor / 2n) / divisor;
    const fraction = String(rounded % 10000n).padStart(4, "0").replace(/0+$/, "");
    return `${rounded / 10000n}${fraction ? `.${fraction}` : ""}%`;
  };
  const calculate = ({ total, positive, currentRate, targetRate }) => {
    const count = parseCount(total, "当前评价数");
    const target = parseRate(targetRate, "目标好评率");
    const hasPositive = String(positive ?? "").trim() !== "";
    const hasRate = String(currentRate ?? "").trim() !== "";
    const rate = hasRate ? parseRate(currentRate, "当前好评率") : null;
    if (count === 0n && rate !== null && rate !== 0n) {
      throw new Error("当前评价数为 0 时，当前好评率请留空或填写 0。");
    }
    let positiveScaled;
    const estimated = !hasPositive && count > 0n;
    if (hasPositive) {
      const good = parseCount(positive, "好评数");
      if (good > count) throw new Error("好评数不能大于当前评价数。");
      positiveScaled = good * fullRate;
    } else if (count === 0n) {
      positiveScaled = 0n;
    } else {
      if (rate === null) throw new Error("请填写好评数或当前好评率，至少一项。");
      positiveScaled = count * rate;
    }
    const deficit = count * target - positiveScaled;
    const current = formatRate(positiveScaled, count);
    if (count > 0n && target === fullRate && deficit > 0n) {
      return { status: "unreachable", estimated, current, additional: null, total: count.toString(), after: null, usedPositive: hasPositive && hasRate };
    }
    const additional = count === 0n ? (target > 0n ? 1n : 0n)
      : deficit <= 0n ? 0n
      : (deficit + (fullRate - target) - 1n) / (fullRate - target);
    return {
      status: "ok", estimated, current, additional: additional.toString(),
      total: (count + additional).toString(),
      after: formatRate(positiveScaled + additional * fullRate, count + additional),
      usedPositive: hasPositive && hasRate
    };
  };
  globalThis.SkuidRating = { calculate };
})();
