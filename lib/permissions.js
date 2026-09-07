import crypto from "crypto";

const STATUSES = new Set(["estimated", "in_production", "completed"]);
const PLASTICS = new Set(["PP", "PET", "PC", "AS", "PS"]);
const FLUTES = new Set(["B Flute", "BC Flute", "C Flute"]);

const str = (v, max = 200) => String(v ?? "").slice(0, max);
const id = (v) => str(v, 80).replace(/[^a-zA-Z0-9_-]/g, "");
const val = (v, max = 40) => str(v, max);

export function emptyComponents() {
  return {
    material: { plasticType: "PP", feePerPc: "", resinRateNote: "" },
    injectPerPc: "",
    innerbox: { flute: "B Flute", sizeLabel: "", L: "", W: "", H: "", unitPrice: "", pcsPerBox: "1" },
    masterbox: { flute: "C Flute", sizeLabel: "", L: "", W: "", H: "", unitPrice: "", pcsPerBox: "" },
    bubblewrapPerPc: "",
    assemblyPerPc: "",
    accessories: { costPerPc: "", notes: "" },
    otherPackaging: { costPerPc: "", notes: "" },
    rejectPct: "3",
  };
}

function box(input = {}, fallbackFlute) {
  return {
    flute: FLUTES.has(input.flute) ? input.flute : fallbackFlute,
    sizeLabel: str(input.sizeLabel, 80),
    L: val(input.L), W: val(input.W), H: val(input.H),
    unitPrice: val(input.unitPrice), pcsPerBox: val(input.pcsPerBox),
  };
}

export function sanitizeComponents(input = {}) {
  return {
    material: {
      plasticType: PLASTICS.has(input?.material?.plasticType) ? input.material.plasticType : "PP",
      feePerPc: val(input?.material?.feePerPc),
      resinRateNote: val(input?.material?.resinRateNote),
    },
    injectPerPc: val(input.injectPerPc),
    innerbox: box(input.innerbox, "B Flute"),
    masterbox: box(input.masterbox, "C Flute"),
    bubblewrapPerPc: val(input.bubblewrapPerPc),
    assemblyPerPc: val(input.assemblyPerPc),
    accessories: { costPerPc: val(input?.accessories?.costPerPc), notes: str(input?.accessories?.notes, 300) },
    otherPackaging: { costPerPc: val(input?.otherPackaging?.costPerPc), notes: str(input?.otherPackaging?.notes, 300) },
    rejectPct: val(input.rejectPct || "3"),
  };
}

function sanitizeRequesterSku(sku, actual = null) {
  return {
    id: id(sku?.id) || crypto.randomUUID(),
    skuCode: str(sku?.skuCode, 100),
    description: str(sku?.description, 300),
    quantity: val(sku?.quantity),
    estimated: sanitizeComponents(sku?.estimated),
    actual: actual ? sanitizeComponents(actual) : emptyComponents(),
  };
}

function sanitizeRequesterPr(pr, existing, session) {
  const oldSkus = new Map((existing?.skus || []).map((s) => [s.id, s]));
  const skus = (Array.isArray(pr?.skus) ? pr.skus : []).slice(0, 500).map((sku) => {
    const old = oldSkus.get(sku?.id);
    return sanitizeRequesterSku(sku, old?.actual);
  });
  return {
    id: id(pr?.id) || crypto.randomUUID(),
    prNumber: str(pr?.prNumber, 60),
    datePlaced: str(pr?.datePlaced, 20),
    status: existing?.status && STATUSES.has(existing.status) ? existing.status : "estimated",
    note: str(pr?.note, 500),
    createdAt: existing?.createdAt || Number(pr?.createdAt) || Date.now(),
    createdBy: existing?.createdBy || session.name,
    requesterLastEditedBy: session.name,
    requesterLastEditedAt: Date.now(),
    factoryLastEditedBy: existing?.factoryLastEditedBy || "",
    factoryLastEditedAt: existing?.factoryLastEditedAt || null,
    skus,
  };
}

export function mergeByRole(current, incoming, session) {
  const safeCurrent = current && Array.isArray(current.prs) ? current : { prs: [] };
  const safeIncoming = incoming && Array.isArray(incoming.prs) ? incoming : { prs: [] };

  if (session.role === "requester") {
    const currentMap = new Map(safeCurrent.prs.map((pr) => [pr.id, pr]));
    const prs = safeIncoming.prs.slice(0, 500).map((pr) => sanitizeRequesterPr(pr, currentMap.get(pr?.id), session));
    return { prs };
  }

  const incomingMap = new Map(safeIncoming.prs.map((pr) => [pr.id, pr]));
  return {
    prs: safeCurrent.prs.map((pr) => {
      const next = incomingMap.get(pr.id);
      if (!next) return pr;
      const nextSkuMap = new Map((next.skus || []).map((sku) => [sku.id, sku]));
      return {
        ...pr,
        status: STATUSES.has(next.status) ? next.status : pr.status,
        factoryLastEditedBy: session.name,
        factoryLastEditedAt: Date.now(),
        skus: pr.skus.map((sku) => {
          const nextSku = nextSkuMap.get(sku.id);
          return nextSku ? { ...sku, actual: sanitizeComponents(nextSku.actual) } : sku;
        }),
      };
    }),
  };
}
