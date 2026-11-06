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
  const resolveInputs = ({ total, positive, currentRate }) => {
    const hasTotal = String(total ?? "").trim() !== "";
    const hasPositive = String(positive ?? "").trim() !== "";
    const hasRate = String(currentRate ?? "").trim() !== "";
    if (Number(hasTotal) + Number(hasPositive) + Number(hasRate) < 2) {
      throw new Error("当前评价数、好评数、当前好评率请至少填写两项。");
    }
    let count = hasTotal ? parseCount(total, "当前评价数") : null;
    let good = hasPositive ? parseCount(positive, "好评数") : null;
    const rate = hasRate ? parseRate(currentRate, "当前好评率") : null;
    if (count === 0n && rate !== null && rate !== 0n) {
      throw new Error("当前评价数为 0 时，当前好评率请留空或填写 0。");
    }
    const inferred = !hasTotal ? "total" : !hasPositive ? "positive" : null;
    // Counts are discrete. A supplied percentage can be rounded by the
    // source platform, so inferred counts are rounded half-up and labeled
    // as estimates; both calculation modes then use the same integer data.
    if (!hasTotal) {
      if (rate === 0n) throw new Error("当前好评率为 0% 时无法反推评价总数，请补充当前评价数。");
      if (good === 0n) throw new Error("好评数为 0 与正的当前好评率不一致，请核对或补充当前评价数。");
      count = (good * fullRate * 2n + rate) / (2n * rate);
    } else if (!hasPositive) {
      good = (count * rate * 2n + fullRate) / (2n * fullRate);
    }
    if (good > count) throw new Error("好评数不能大于当前评价数。");
    return { count, good, inferred, usedPositive: hasTotal && hasPositive && hasRate };
  };
  const calculate = (inputs) => {
    const mode = inputs.mode ?? "add";
    if (mode !== "add" && mode !== "delete") throw new Error("请选择有效的计算方式。");
    const { count, good, inferred, usedPositive } = resolveInputs(inputs);
    const target = parseRate(inputs.targetRate, "目标好评率");
    const positiveScaled = good * fullRate;
    const deficit = count * target - positiveScaled;
    const base = {
      mode, estimated: inferred !== null, inferred, usedPositive,
      current: formatRate(positiveScaled, count),
      beforeTotal: count.toString(), positive: good.toString(), nonPositive: (count - good).toString()
    };
    const unreachable = (reason) => ({
      ...base, status: "unreachable", reason, amount: null, additional: null,
      removed: null, total: count.toString(), after: null
    });
    if (mode === "delete") {
      if (target > 0n && good === 0n) {
        return unreachable(count === 0n ? "当前没有评价可删除，无法通过删除达到正的目标好评率。" : "当前没有好评，删除非好评后仍为 0%；全部删除后无评价，也不能达到正的目标好评率。");
      }
      const removed = deficit <= 0n ? 0n : (deficit + target - 1n) / target;
      if (removed > count - good || (target > 0n && count - removed === 0n)) {
        return unreachable("所需删除数量超过现有非好评数，无法仅靠删除非好评达到目标。");
      }
      return {
        ...base, status: "ok", amount: removed.toString(), removed: removed.toString(), additional: null,
        total: (count - removed).toString(), after: formatRate(positiveScaled, count - removed)
      };
    }
    if (count > 0n && target === fullRate && deficit > 0n) {
      return unreachable("已有非好评时，有限数量的新增好评只能无限接近 100%，无法达到严格的 100%。");
    }
    const additional = count === 0n ? (target > 0n ? 1n : 0n)
      : deficit <= 0n ? 0n
      : (deficit + (fullRate - target) - 1n) / (fullRate - target);
    return {
      ...base, status: "ok", amount: additional.toString(), additional: additional.toString(), removed: null,
      total: (count + additional).toString(),
      after: formatRate(positiveScaled + additional * fullRate, count + additional)
    };
  };
  globalThis.SkuidRating = { calculate };
})();
