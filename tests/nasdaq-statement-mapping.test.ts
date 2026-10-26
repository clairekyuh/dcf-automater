import assert from "node:assert/strict";
import test from "node:test";
import { cashAndInvestments, statementFundedDebt, statementObservation, type NasdaqTable } from "../app/api/company/route";

const alphabetBalance: NasdaqTable = {
  rows: [
    { value1: "Cash and Cash Equivalents", value2: "$30,708,000" },
    { value1: "Short-Term Investments", value2: "$96,135,000" },
    { value1: "Short-Term Debt / Current Portion of Long-Term Debt", value2: "--" },
    { value1: "Long-Term Debt", value2: "$46,547,000" },
  ],
};

test("a reported blank balance is zero rather than a missing accounting row", () => {
  assert.deepEqual(
    statementObservation(alphabetBalance, ["Short-Term Debt / Current Portion of Long-Term Debt"], "value2"),
    { present: true, value: null },
  );
  assert.deepEqual(statementFundedDebt(alphabetBalance, "value2"), {
    shortDebt: 0,
    longDebt: 46_547,
    total: 46_547,
  });
  assert.equal(cashAndInvestments(alphabetBalance, "value2"), 126_843);
});

test("an absent debt row remains unresolved instead of being fabricated as zero", () => {
  const incomplete: NasdaqTable = { rows: [{ value1: "Long-Term Debt", value2: "$1,000" }] };
  assert.deepEqual(statementFundedDebt(incomplete, "value2"), {
    shortDebt: null,
    longDebt: 1,
    total: null,
  });
});

test("statement labels tolerate punctuation and spacing differences", () => {
  const variant: NasdaqTable = { rows: [{ value1: "Cash & Cash Equivalents", value2: "$2,500" }] };
  assert.equal(cashAndInvestments(variant, "value2"), 2.5);
});
