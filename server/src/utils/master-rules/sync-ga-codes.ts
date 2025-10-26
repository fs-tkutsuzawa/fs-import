type MasterRuleReference = {
  refAccountCode: string;
  operator?: string;
  [key: string]: unknown;
};

type MasterRuleDefinitionReference = {
  refAccountCode: string;
  [key: string]: unknown;
};

type MasterRuleDefinition = {
  formula?: {
    references?: MasterRuleDefinitionReference[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type MasterRule = {
  targetAccountCode: string;
  calculation?: MasterRuleReference[];
  rule_definition?: MasterRuleDefinition;
  [key: string]: unknown;
};

export type SyncMasterRulesResult = {
  rules: MasterRule[];
  targetUpdates: number;
  referenceUpdates: number;
};

const CODE_NOT_FOUND_MESSAGE =
  'The following GA code(s) were not found in the provided mapping:';

function normalizeCode(code: string | null | undefined): string {
  if (code == null) {
    return '';
  }
  return code.trim();
}

function getCanonicalCode(
  code: string,
  mapping: Map<string, string>,
  missingCodes: Set<string>
): string {
  const normalized = normalizeCode(code);
  if (!normalized) {
    missingCodes.add('<<empty>>');
    return normalized;
  }
  const canonical = mapping.get(normalized);
  if (!canonical) {
    missingCodes.add(normalized);
    return normalized;
  }
  return canonical;
}

function cloneRuleDefinition(
  definition: MasterRuleDefinition | undefined
): MasterRuleDefinition | undefined {
  if (!definition) {
    return definition;
  }
  const cloned: MasterRuleDefinition = { ...definition };
  if (definition.formula) {
    cloned.formula = { ...definition.formula };
    if (definition.formula.references) {
      cloned.formula.references = definition.formula.references.map((ref) => ({
        ...ref,
      }));
    }
  }
  return cloned;
}

function cloneReferences(
  references: MasterRuleReference[] | undefined
): MasterRuleReference[] | undefined {
  if (!references) {
    return references;
  }
  return references.map((ref) => ({ ...ref }));
}

export function syncMasterRulesGaCodes(
  rules: MasterRule[],
  mapping: Map<string, string>
): SyncMasterRulesResult {
  const missingCodes = new Set<string>();
  let targetUpdates = 0;
  let referenceUpdates = 0;

  const updatedRules = rules.map((rule) => {
    const clonedRule: MasterRule = { ...rule };
    const originalTarget = normalizeCode(rule.targetAccountCode);
    const canonicalTarget = getCanonicalCode(
      originalTarget,
      mapping,
      missingCodes
    );
    if (canonicalTarget !== originalTarget) {
      targetUpdates += 1;
    }
    clonedRule.targetAccountCode = canonicalTarget;

    if (Array.isArray(rule.calculation)) {
      clonedRule.calculation = cloneReferences(rule.calculation)?.map(
        (reference) => {
          const originalRef = normalizeCode(reference.refAccountCode);
          const canonicalRef = getCanonicalCode(
            originalRef,
            mapping,
            missingCodes
          );
          if (canonicalRef !== originalRef) {
            referenceUpdates += 1;
          }
          return {
            ...reference,
            refAccountCode: canonicalRef,
          };
        }
      );
    }

    if (rule.rule_definition?.formula?.references) {
      const clonedDefinition = cloneRuleDefinition(rule.rule_definition);
      const references = clonedDefinition?.formula?.references ?? [];
      clonedDefinition!.formula!.references = references.map((reference) => {
        const originalRef = normalizeCode(reference.refAccountCode);
        const canonicalRef = getCanonicalCode(
          originalRef,
          mapping,
          missingCodes
        );
        if (canonicalRef !== originalRef) {
          referenceUpdates += 1;
        }
        return {
          ...reference,
          refAccountCode: canonicalRef,
        };
      });
      clonedRule.rule_definition = clonedDefinition;
    } else if (rule.rule_definition) {
      clonedRule.rule_definition = cloneRuleDefinition(rule.rule_definition);
    }

    return clonedRule;
  });

  if (missingCodes.size > 0) {
    const codes = Array.from(missingCodes).sort().join(', ');
    const error = new Error(`${CODE_NOT_FOUND_MESSAGE} ${codes}`);
    error.name = 'MissingGaCodeError';
    throw error;
  }

  return {
    rules: updatedRules,
    targetUpdates,
    referenceUpdates,
  };
}
