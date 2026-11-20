// Pay-in fee maths. The rate is stored on the order in basis points (250 = 2.50%) when the order
// is created, so a later change to the merchant's rate never changes an old order. Amounts are
// integer paise and the fee is rounded to the nearest paisa.
//
// An order created before the rate was stored has no rate: its fee and payable stay null.
const computeFee = (amountPaise, payinBps) => {
    if (payinBps == null) return { feePaise: null, payablePaise: null };
    const feePaise = Math.round((amountPaise * payinBps) / 10000);
    return { feePaise, payablePaise: amountPaise - feePaise };
};

module.exports = { computeFee };
