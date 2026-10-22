export type SecFact = {
  start?: string;
  end: string;
  val: number;
  form: string;
  filed: string;
  fp?: string;
  fy?: number;
  accn?: string;
  frame?: string;
};

export type SecTaxonomyConcept = {
  label?: string;
  description?: string;
  units?: Record<string, SecFact[]>;
};

export type SecTaxonomy = Record<string, SecTaxonomyConcept | undefined>;

export type FinancialObservationStatus = "reported" | "calculated" | "not-reported";

export type FinancialObservation = {
  concept: string;
  value: number | null;
  status: FinancialObservationStatus;
  confidence: "high" | "medium" | "low";
  method: "aggregate" | "component-sum" | "single-tag" | "unavailable";
  rawTags: string[];
  components: Array<{
    tag: string;
    value: number;
    start: string | null;
    end: string;
    filed: string;
    accession: string | null;
    form: string;
    unit: string;
  }>;
  reason: string;
};

export type ResolvedSecFinancialConcepts = {
  depreciationAndAmortization: FinancialObservation;
  propertyDepreciation: FinancialObservation;
  intangibleAmortization: FinancialObservation;
  contractCostAmortization: FinancialObservation;
  shareBasedCompensation: FinancialObservation;
  deferredTaxCashFlowAdjustment: FinancialObservation;
  propertyCapex: FinancialObservation;
  intangibleCapex: FinancialObservation;
  totalCapex: FinancialObservation;
  contractCostAsset: FinancialObservation;
};

const ANNUAL_FORMS = new Set(["10-K", "20-F", "40-F"]);
const DAY = 86_400_000;

function durationDays(fact: SecFact) {
  return fact.start ? (Date.parse(fact.end) - Date.parse(fact.start)) / DAY : Number.NaN;
}

function observationComponent(tag: string, fact: SecFact, unit: string) {
  return {
    tag,
    value: fact.val,
    start: fact.start || null,
    end: fact.end,
    filed: fact.filed,
    accession: fact.accn || null,
    form: fact.form,
    unit,
  };
}

function selectedFact(taxonomy: SecTaxonomy, tag: string, reportDate: string, unit: string, duration: boolean) {
  const facts = taxonomy[tag]?.units?.[unit] || [];
  const compatible = facts.filter((fact) => {
    if (!ANNUAL_FORMS.has(fact.form) || fact.end !== reportDate || !Number.isFinite(fact.val)) return false;
    if (!duration) return !fact.start;
    if (!fact.start) return false;
    const days = durationDays(fact);
    return days >= 250 && days <= 400;
  });
  return [...compatible].sort((a, b) => b.filed.localeCompare(a.filed) || String(b.accn || "").localeCompare(String(a.accn || "")))[0] || null;
}

export function resolveAnnualObservation(
  taxonomy: SecTaxonomy,
  input: {
    concept: string;
    reportDate: string;
    tags: string[];
    unit?: string;
    duration?: boolean;
    reason?: string;
  },
): FinancialObservation {
  const unit = input.unit || "USD";
  for (const tag of input.tags) {
    const fact = selectedFact(taxonomy, tag, input.reportDate, unit, input.duration !== false);
    if (!fact) continue;
    return {
      concept: input.concept,
      value: fact.val,
      status: "reported",
      confidence: "high",
      method: "single-tag",
      rawTags: [tag],
      components: [observationComponent(tag, fact, unit)],
      reason: input.reason || `Selected the highest-priority compatible ${tag} fact for the fiscal period.`,
    };
  }
  return {
    concept: input.concept,
    value: null,
    status: "not-reported",
    confidence: "low",
    method: "unavailable",
    rawTags: [],
    components: [],
    reason: `No compatible ${input.concept} fact was reported for ${input.reportDate}.`,
  };
}

function sumObservations(concept: string, observations: FinancialObservation[], reason: string): FinancialObservation {
  const available = observations.filter((observation) => observation.value !== null);
  if (!available.length) {
    return { concept, value: null, status: "not-reported", confidence: "low", method: "unavailable", rawTags: [], components: [], reason };
  }
  return {
    concept,
    value: available.reduce((sum, observation) => sum + observation.value!, 0),
    status: available.length === observations.length ? "calculated" : "calculated",
    confidence: available.length === observations.length ? "medium" : "low",
    method: "component-sum",
    rawTags: available.flatMap((observation) => observation.rawTags),
    components: available.flatMap((observation) => observation.components),
    reason,
  };
}

export function resolveDepreciationAndAmortization(taxonomy: SecTaxonomy, reportDate: string) {
  const aggregate = resolveAnnualObservation(taxonomy, {
    concept: "depreciation-and-amortization",
    reportDate,
    tags: [
      "DepreciationDepletionAndAmortization",
      "DepreciationAndAmortization",
      "DepreciationDepletionAndAmortizationPropertyPlantAndEquipmentAndIntangibleAssets",
    ],
    reason: "A consolidated depreciation and amortization fact takes precedence over narrower components.",
  });
  if (aggregate.value !== null) return { aggregate, property: resolvePropertyDepreciation(taxonomy, reportDate), intangible: resolveIntangibleAmortization(taxonomy, reportDate) };

  const property = resolvePropertyDepreciation(taxonomy, reportDate);
  const intangible = resolveIntangibleAmortization(taxonomy, reportDate);
  return {
    aggregate: sumObservations(
      "depreciation-and-amortization",
      [property, intangible],
      "No consolidated D&A fact was reported. The value is reconstructed from non-overlapping property depreciation and intangible-amortization components.",
    ),
    property,
    intangible,
  };
}

function resolvePropertyDepreciation(taxonomy: SecTaxonomy, reportDate: string) {
  return resolveAnnualObservation(taxonomy, {
    concept: "property-depreciation",
    reportDate,
    tags: ["DepreciationDepletionAndAmortizationPropertyPlantAndEquipment", "Depreciation", "DepreciationNonproduction", "DepreciationPremisesAndEquipment"],
    reason: "Property depreciation is retained as a component and is not treated as total D&A when broader amortization exists.",
  });
}

function resolveIntangibleAmortization(taxonomy: SecTaxonomy, reportDate: string) {
  return resolveAnnualObservation(taxonomy, {
    concept: "intangible-amortization",
    reportDate,
    tags: ["FiniteLivedIntangibleAssetsAmortizationExpense", "AmortizationOfAcquiredIntangibleAssets", "AmortizationOfIntangibleAssets"],
  });
}

export function resolveSecFinancialConcepts(taxonomy: SecTaxonomy, reportDate: string): ResolvedSecFinancialConcepts {
  const da = resolveDepreciationAndAmortization(taxonomy, reportDate);
  const propertyCapex = resolveAnnualObservation(taxonomy, {
    concept: "property-capex",
    reportDate,
    tags: ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsForAdditionsToPropertyPlantAndEquipment"],
  });
  const intangibleCapex = resolveAnnualObservation(taxonomy, {
    concept: "intangible-capex",
    reportDate,
    tags: ["PaymentsToAcquireIntangibleAssets", "PaymentsToAcquireProductiveAssets"],
  });
  const totalCapex = sumObservations(
    "total-capex",
    [propertyCapex, intangibleCapex],
    "Total capex includes separately reported property and intangible purchases. Missing components remain visible in the observation confidence.",
  );
  return {
    depreciationAndAmortization: da.aggregate,
    propertyDepreciation: da.property,
    intangibleAmortization: da.intangible,
    contractCostAmortization: resolveAnnualObservation(taxonomy, {
      concept: "contract-cost-amortization",
      reportDate,
      tags: ["CapitalizedContractCostAmortization"],
    }),
    shareBasedCompensation: resolveAnnualObservation(taxonomy, {
      concept: "share-based-compensation",
      reportDate,
      tags: ["ShareBasedCompensation", "AllocatedShareBasedCompensationExpense"],
    }),
    deferredTaxCashFlowAdjustment: resolveAnnualObservation(taxonomy, {
      concept: "deferred-tax-cash-flow-adjustment",
      reportDate,
      tags: ["IncreaseDecreaseInDeferredIncomeTaxes", "DeferredIncomeTaxExpenseBenefit"],
    }),
    propertyCapex,
    intangibleCapex,
    totalCapex,
    contractCostAsset: resolveAnnualObservation(taxonomy, {
      concept: "capitalized-contract-cost-asset",
      reportDate,
      tags: ["CapitalizedContractCostNet"],
      duration: false,
    }),
  };
}

export function observationMillions(observation: FinancialObservation) {
  return observation.value === null ? null : observation.value / 1_000_000;
}
