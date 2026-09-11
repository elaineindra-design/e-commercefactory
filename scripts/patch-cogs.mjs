import fs from "node:fs";

const path = "components/COGSTracker.jsx";
let source = fs.readFileSync(path, "utf8");

const oldCreate = `  const createPr = (pr) => {
    dirtyRef.current = true;
    changeVersionRef.current += 1;
    setData((d) => ({ ...d, prs: [pr, ...d.prs] }));
    setView({ name: "dashboard" });
  };`;

const newCreate = `  const createPr = (pr) => {
    dirtyRef.current = true;
    changeVersionRef.current += 1;
    setData((d) => ({ ...d, prs: [pr, ...d.prs] }));
    setView({ name: "detail", id: pr.id });
  };`;

const oldSubmit = `  const submit = () => {
    if (!prNumber.trim()) return setErr("Give the request a number.");
    if (dupe) return setErr("That request number is already in use.");
    const clean = skus.filter((s) => s.skuCode.trim());
    if (clean.length === 0) return setErr("Add at least one SKU code.");
    const pr = {
      id: uid(),
      prNumber: prNumber.trim(),
      datePlaced,
      status: "estimated",
      note: note.trim(),
      createdAt: Date.now(),
      skus: clean.map((s) => ({
        id: uid(),
        skuCode: s.skuCode.trim(),
        description: s.description.trim(),
        quantity: s.quantity || "0",
        estimated: emptyComponents(),
        actual: emptyComponents(),
      })),
    };
    onCreate(pr);
  };`;

const newSubmit = `  const submit = () => {
    if (!prNumber.trim()) return setErr("Give the request a number.");
    if (dupe) return setErr("That request number is already in use.");
    const rows = skus.length ? skus : [{ id: uid(), skuCode: "", description: "", quantity: "" }];
    const pr = {
      id: uid(),
      prNumber: prNumber.trim(),
      datePlaced,
      status: "estimated",
      note: note.trim(),
      createdAt: Date.now(),
      skus: rows.map((s) => ({
        id: uid(),
        skuCode: s.skuCode.trim(),
        description: s.description.trim(),
        quantity: s.quantity || "0",
        estimated: emptyComponents(),
        actual: emptyComponents(),
      })),
    };
    onCreate(pr);
  };`;

if (!source.includes(oldCreate)) {
  throw new Error("Could not find createPr block to patch");
}
if (!source.includes(oldSubmit)) {
  throw new Error("Could not find NewRequest submit block to patch");
}

source = source.replace(oldCreate, newCreate).replace(oldSubmit, newSubmit);
fs.writeFileSync(path, source);
console.log("Applied request creation UX patch");
