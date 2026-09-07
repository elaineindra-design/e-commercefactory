"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";

/* =========================================================================
   Production COGS Tracker
   - Requester creates a production request (PR) with SKUs -> estimated COGS
   - Factory logs the real cost of each component -> actual COGS
   - Estimate vs actual variance tracked per SKU and per PR
   - Data saved to shared storage so both people see the same records
   ========================================================================= */

/* ---------- reference data ---------- */
const PLASTICS = ["PP", "PET", "PC", "AS", "PS"];
const FLUTES = ["B Flute", "BC Flute", "C Flute"];
const STATUSES = [
  { id: "estimated", label: "Estimated" },
  { id: "in_production", label: "In production" },
  { id: "completed", label: "Completed" },
];

/* ---------- helpers ---------- */
const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const uid = () => Math.random().toString(36).slice(2, 10);
const todayISO = () => new Date().toISOString().slice(0, 10);

const fmtRp = (n) =>
  "Rp\u00A0" + Math.round(num(n)).toLocaleString("id-ID");
const fmtRp2 = (n) => {
  // finer precision for tiny per-piece figures
  const v = num(n);
  if (v !== 0 && Math.abs(v) < 100)
    return "Rp\u00A0" + v.toLocaleString("id-ID", { maximumFractionDigits: 2 });
  return fmtRp(v);
};
const fmtPct = (n) => (num(n) >= 0 ? "+" : "") + num(n).toFixed(1) + "%";

const emptyComponents = () => ({
  material: { plasticType: "PP", feePerPc: "", resinRateNote: "" },
  injectPerPc: "",
  innerbox: { flute: "B Flute", sizeLabel: "", L: "", W: "", H: "", unitPrice: "", pcsPerBox: "1" },
  masterbox: { flute: "C Flute", sizeLabel: "", L: "", W: "", H: "", unitPrice: "", pcsPerBox: "" },
  bubblewrapPerPc: "",
  assemblyPerPc: "",
  accessories: { costPerPc: "", notes: "" },
  otherPackaging: { costPerPc: "", notes: "" },
  rejectPct: "3",
});

const boxPerPc = (b) => {
  const per = num(b.pcsPerBox);
  return per > 0 ? num(b.unitPrice) / per : 0;
};

// RSC blank board area (m2) for reference — dims in cm
const blankAreaM2 = (b) => {
  const L = num(b.L), W = num(b.W), H = num(b.H);
  if (L <= 0 || W <= 0 || H <= 0) return 0;
  const cm2 = ((L + W) * 2 + 8) * (W + H + 4);
  return cm2 / 10000;
};

const computeCogs = (c, qty) => {
  const material = num(c.material.feePerPc);
  const inject = num(c.injectPerPc);
  const inner = boxPerPc(c.innerbox);
  const master = boxPerPc(c.masterbox);
  const bubble = num(c.bubblewrapPerPc);
  const assembly = num(c.assemblyPerPc);
  const acc = num(c.accessories.costPerPc);
  const other = num(c.otherPackaging.costPerPc);
  const subtotal = material + inject + inner + master + bubble + assembly + acc + other;
  const rejectPct = num(c.rejectPct);
  const reject = subtotal * (rejectPct / 100);
  const cogsPerPc = subtotal + reject;
  const total = cogsPerPc * num(qty);
  return { material, inject, inner, master, bubble, assembly, acc, other, subtotal, reject, cogsPerPc, total };
};

const hasAnyCost = (c) => {
  const b = computeCogs(c, 1);
  return b.subtotal > 0;
};

/* ---------- persistence ---------- */
const LOCAL_KEY = "pcogs:data:v2";

async function fetchSession() {
  const r = await fetch("/api/session", { cache: "no-store" });
  if (!r.ok) return null;
  const j = await r.json();
  return j.session || null;
}

async function loadData() {
  try {
    const r = await fetch("/api/data", { cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      if (j.persistence === "remote") return { data: j.data || { prs: [] }, persistence: "remote" };
    }
  } catch (e) {}
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    return { data: raw ? JSON.parse(raw) : { prs: [] }, persistence: "local" };
  } catch (e) {
    return { data: { prs: [] }, persistence: "local" };
  }
}

async function saveData(data, persistence) {
  if (persistence === "remote") {
    const r = await fetch("/api/data", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data }),
    });
    if (!r.ok) throw new Error("Unable to save shared data");
    return await r.json();
  }
  window.localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
  return { ok: true, persistence: "local", data };
}

/* =========================================================================
   Root
   ========================================================================= */
export default function App() {
  const [session, setSession] = useState(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [data, setData] = useState({ prs: [] });
  const [loaded, setLoaded] = useState(false);
  const [persistence, setPersistence] = useState("local");
  const [saveError, setSaveError] = useState("");
  const [view, setView] = useState({ name: "dashboard" });
  const saveTimer = useRef(null);
  const skipNextSave = useRef(false);

  useEffect(() => {
    try {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&display=swap";
      document.head.appendChild(l);
    } catch (e) {}
  }, []);

  const refreshData = useCallback(async () => {
    if (!session) return;
    const result = await loadData();
    skipNextSave.current = true;
    setData(result.data || { prs: [] });
    setPersistence(result.persistence || "local");
    setLoaded(true);
    setSaveError("");
  }, [session]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const existing = await fetchSession();
        if (alive) setSession(existing);
      } finally {
        if (alive) setSessionChecked(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!session) {
      setLoaded(false);
      return;
    }
    refreshData();
  }, [session, refreshData]);

  useEffect(() => {
    if (!session || !loaded) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const result = await saveData(data, persistence);
        if (result?.data && persistence === "remote") {
          skipNextSave.current = true;
          setData(result.data);
        }
        setSaveError("");
      } catch (e) {
        setSaveError("Changes could not be saved. Try Refresh, then edit again.");
      }
    }, 500);
    return () => saveTimer.current && clearTimeout(saveTimer.current);
  }, [data, loaded, persistence, session]);

  const updatePr = useCallback((prId, updater) => {
    setData((d) => ({ ...d, prs: d.prs.map((p) => (p.id === prId ? updater(p) : p)) }));
  }, []);
  const updateSku = useCallback((prId, skuId, updater) => {
    updatePr(prId, (p) => ({ ...p, skus: p.skus.map((s) => (s.id === skuId ? updater(s) : s)) }));
  }, [updatePr]);

  const createPr = (pr) => {
    setData((d) => ({ ...d, prs: [pr, ...d.prs] }));
    setView({ name: "dashboard" });
  };
  const deletePr = (prId) => {
    setData((d) => ({ ...d, prs: d.prs.filter((p) => p.id !== prId) }));
    setView({ name: "dashboard" });
  };

  const logout = async () => {
    try { await fetch("/api/session", { method: "DELETE" }); } catch {}
    setSession(null);
    setData({ prs: [] });
    setView({ name: "dashboard" });
  };

  const currentPr = view.name === "detail" ? data.prs.find((p) => p.id === view.id) : null;
  const role = session?.role;

  if (!sessionChecked) {
    return <div className="app"><style>{CSS}</style><div className="login-shell"><div className="login-card"><div className="muted">Loading…</div></div></div></div>;
  }

  if (!session) {
    return <div className="app"><style>{CSS}</style><LoginLanding onLogin={setSession} /></div>;
  }

  return (
    <div className="app">
      <style>{CSS}</style>
      <TopBar session={session} setView={setView} onLogout={logout} onRefresh={refreshData} />

      {!loaded ? (
        <div className="wrap"><div className="muted pad">Loading records…</div></div>
      ) : (
        <div className="wrap">
          {persistence === "local" && (
            <div className="banner">
              Local demo mode — data is saved only in this browser. Add Upstash Redis environment variables in Vercel to make requester and factory records shared across devices.
            </div>
          )}
          {saveError && <div className="banner banner-bad">{saveError}</div>}

          {view.name === "dashboard" && (
            <Dashboard
              data={data}
              role={role}
              onOpen={(id) => setView({ name: "detail", id })}
              onNew={() => role === "requester" && setView({ name: "new" })}
            />
          )}

          {view.name === "new" && role === "requester" && (
            <NewRequest
              existing={data.prs}
              onCancel={() => setView({ name: "dashboard" })}
              onCreate={createPr}
            />
          )}

          {view.name === "detail" && currentPr && (
            <PrDetail
              pr={currentPr}
              role={role}
              onBack={() => setView({ name: "dashboard" })}
              updatePr={updatePr}
              updateSku={updateSku}
              deletePr={deletePr}
            />
          )}
          {view.name === "detail" && !currentPr && (
            <div className="card pad">
              This request no longer exists. <button className="link" onClick={() => setView({ name: "dashboard" })}>Back to all requests</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LoginLanding({ onLogin }) {
  const [role, setRole] = useState(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!role) return setError("Choose whether you are a Requester or Factory.");
    if (!name.trim()) return setError("Enter your name.");
    setBusy(true);
    try {
      const r = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, name: name.trim(), password }),
      });
      const j = await r.json();
      if (!r.ok) return setError(j.error || "Unable to sign in.");
      onLogin(j.session);
    } catch {
      setError("Unable to sign in. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand"><span className="brand-mark" aria-hidden>◧</span> Production COGS</div>
        <h1 className="login-title">Who are you entering as?</h1>
        <p className="login-sub">Choose your side first. Your role determines which production costs you can edit.</p>

        <div className="role-cards">
          <button type="button" className={"role-card" + (role === "requester" ? " selected" : "")} onClick={() => { setRole("requester"); setError(""); }}>
            <span className="role-card-title">Requester</span>
            <span className="role-card-copy">Create production requests and enter estimated COGS.</span>
          </button>
          <button type="button" className={"role-card" + (role === "factory" ? " selected" : "")} onClick={() => { setRole("factory"); setError(""); }}>
            <span className="role-card-title">Factory</span>
            <span className="role-card-copy">Enter actual production costs and update production status.</span>
          </button>
        </div>

        <form className="login-form" onSubmit={submit}>
          <Field label="Your name">
            <input className="in login-input" autoFocus placeholder="e.g. Elaine" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          {role === "requester" && (
            <Field label="Requester password">
              <input className="in login-input" type="password" placeholder="Enter password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
          )}
          {role === "factory" && <div className="factory-note">No factory password is required in this first version.</div>}
          {error && <div className="login-error">{error}</div>}
          <button className="btn btn-primary login-submit" disabled={busy}>{busy ? "Signing in…" : "Continue"}</button>
        </form>
      </div>
    </div>
  );
}

/* =========================================================================
   Top bar
   ========================================================================= */
function TopBar({ session, setView, onLogout, onRefresh }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <button className="brand" onClick={() => setView({ name: "dashboard" })} aria-label="Go to dashboard">
          <span className="brand-mark" aria-hidden>◧</span>
          <span className="brand-name">Production COGS</span>
        </button>
        <div className="topbar-right">
          <button className="top-action" onClick={onRefresh}>Refresh</button>
          <div className="signed-user">
            <span className="signed-name">{session.name}</span>
            <span className="signed-role">{session.role === "requester" ? "Requester" : "Factory"}</span>
          </div>
          <button className="top-action" onClick={onLogout}>Sign out</button>
        </div>
      </div>
    </header>
  );
}

/* =========================================================================
   Dashboard
   ========================================================================= */
function Dashboard({ data, role, onOpen, onNew }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");

  const rows = useMemo(() => {
    return data.prs.map((pr) => {
      let est = 0, act = 0, pieces = 0, actEntered = false;
      pr.skus.forEach((s) => {
        est += computeCogs(s.estimated, s.quantity).total;
        act += computeCogs(s.actual, s.quantity).total;
        pieces += num(s.quantity);
        if (hasAnyCost(s.actual)) actEntered = true;
      });
      const variance = actEntered ? act - est : null;
      const pct = actEntered && est > 0 ? (variance / est) * 100 : null;
      return { pr, est, act, pieces, actEntered, variance, pct };
    });
  }, [data]);

  const filtered = rows.filter((r) => {
    if (status !== "all" && r.pr.status !== status) return false;
    if (!q.trim()) return true;
    const t = q.toLowerCase();
    if (r.pr.prNumber.toLowerCase().includes(t)) return true;
    return r.pr.skus.some(
      (s) => s.skuCode.toLowerCase().includes(t) || (s.description || "").toLowerCase().includes(t)
    );
  });

  // KPIs across active (non-completed) requests
  const kpi = useMemo(() => {
    const active = rows.filter((r) => r.pr.status !== "completed");
    const openCount = active.length;
    const pieces = active.reduce((a, r) => a + r.pieces, 0);
    const estVal = active.reduce((a, r) => a + r.est, 0);
    const withAct = rows.filter((r) => r.actEntered);
    const estOfActual = withAct.reduce((a, r) => a + r.est, 0);
    const actOfActual = withAct.reduce((a, r) => a + r.act, 0);
    const varPct = estOfActual > 0 ? ((actOfActual - estOfActual) / estOfActual) * 100 : null;
    return { openCount, pieces, estVal, varPct, logged: withAct.length };
  }, [rows]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="h1">Production requests</h1>
          <p className="sub">Track the real cost of every SKU, from estimate to what the factory actually spent.</p>
        </div>
        {role === "requester" ? <button className="btn btn-primary" onClick={onNew}>Create request</button> : <span className="role-help">Factory mode · actual costs only</span>}
      </div>

      <div className="kpis">
        <Kpi label="Open requests" value={kpi.openCount} />
        <Kpi label="Pieces in the pipeline" value={num(kpi.pieces).toLocaleString("id-ID")} />
        <Kpi label="Estimated value (open)" value={fmtRp(kpi.estVal)} mono />
        <Kpi
          label={kpi.logged ? `Variance on ${kpi.logged} logged` : "Variance"}
          value={kpi.varPct == null ? "—" : fmtPct(kpi.varPct)}
          tone={kpi.varPct == null ? "" : kpi.varPct > 0 ? "bad" : "good"}
          mono
        />
      </div>

      <div className="toolbar">
        <input
          className="search"
          placeholder="Search request # or SKU"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="seg small">
          <button className={"seg-btn" + (status === "all" ? " on" : "")} onClick={() => setStatus("all")}>All</button>
          {STATUSES.map((s) => (
            <button key={s.id} className={"seg-btn" + (status === s.id ? " on" : "")} onClick={() => setStatus(s.id)}>{s.label}</button>
          ))}
        </div>
      </div>

      {data.prs.length === 0 ? (
        <div className="empty">
          <div className="empty-mark" aria-hidden>◧</div>
          <h3>No requests yet</h3>
          {role === "requester" ? (
            <>
              <p>Create your first production request to capture the SKUs, quantities, and an estimated COGS. The factory can log the real costs afterward.</p>
              <button className="btn btn-primary" onClick={onNew}>Create request</button>
            </>
          ) : (
            <p>No production requests are available yet. Ask the requester to create one, then refresh this page.</p>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card pad muted">No requests match that filter.</div>
      ) : (
        <div className="card table-card">
          <table className="table">
            <thead>
              <tr>
                <th>Request</th>
                <th>Date placed</th>
                <th className="r">SKUs</th>
                <th className="r">Pieces</th>
                <th className="r">Est. COGS</th>
                <th className="r">Actual COGS</th>
                <th className="r">Variance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.pr.id} className="row" onClick={() => onOpen(r.pr.id)} tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && onOpen(r.pr.id)}>
                  <td><span className="pr-num">#{r.pr.prNumber}</span></td>
                  <td className="muted">{r.pr.datePlaced}</td>
                  <td className="r mono">{r.pr.skus.length}</td>
                  <td className="r mono">{num(r.pieces).toLocaleString("id-ID")}</td>
                  <td className="r mono">{fmtRp(r.est)}</td>
                  <td className="r mono">{r.actEntered ? fmtRp(r.act) : <span className="muted">—</span>}</td>
                  <td className="r mono">
                    {r.pct == null ? <span className="muted">—</span> : (
                      <span className={r.pct > 0 ? "bad" : "good"}>{fmtPct(r.pct)}</span>
                    )}
                  </td>
                  <td><StatusPill status={r.pr.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Methodology />
    </div>
  );
}

function Kpi({ label, value, tone = "", mono }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className={"kpi-value" + (mono ? " mono" : "") + (tone ? " " + tone : "")}>{value}</div>
    </div>
  );
}

function StatusPill({ status }) {
  const s = STATUSES.find((x) => x.id === status) || STATUSES[0];
  return <span className={"pill pill-" + s.id}>{s.label}</span>;
}

/* =========================================================================
   New request
   ========================================================================= */
function NewRequest({ existing, onCancel, onCreate }) {
  const [prNumber, setPrNumber] = useState(() => {
    const nums = existing.map((p) => parseInt(p.prNumber, 10)).filter((n) => Number.isFinite(n));
    const next = nums.length ? Math.max(...nums) + 1 : 1001;
    return String(next);
  });
  const [datePlaced, setDatePlaced] = useState(todayISO());
  const [note, setNote] = useState("");
  const [skus, setSkus] = useState([
    { id: uid(), skuCode: "", description: "", quantity: "" },
  ]);
  const [err, setErr] = useState("");

  const dupe = existing.some((p) => p.prNumber.trim() === prNumber.trim());

  const addSku = () => setSkus((s) => [...s, { id: uid(), skuCode: "", description: "", quantity: "" }]);
  const rmSku = (id) => setSkus((s) => (s.length > 1 ? s.filter((x) => x.id !== id) : s));
  const setSku = (id, patch) => setSkus((s) => s.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const submit = () => {
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
  };

  return (
    <div>
      <button className="link back" onClick={onCancel}>← All requests</button>
      <div className="page-head">
        <div>
          <h1 className="h1">New production request</h1>
          <p className="sub">One request can hold several SKUs. You'll fill in the estimated costs on the next screen.</p>
        </div>
      </div>

      <div className="card pad">
        <div className="grid-3">
          <Field label="Request number">
            <input className={"in" + (dupe ? " in-err" : "")} value={prNumber}
              onChange={(e) => { setPrNumber(e.target.value); setErr(""); }} />
            {dupe && <div className="hint bad">Already in use</div>}
          </Field>
          <Field label="Date placed">
            <input className="in" type="date" value={datePlaced} onChange={(e) => setDatePlaced(e.target.value)} />
          </Field>
          <Field label="Note (optional)">
            <input className="in" placeholder="e.g. rush order for Q4" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>

        <div className="sku-head">
          <h3 className="h3">SKUs in this request</h3>
          <button className="btn btn-ghost" onClick={addSku}>+ Add SKU</button>
        </div>

        <div className="sku-list">
          {skus.map((s, i) => (
            <div className="sku-line" key={s.id}>
              <div className="sku-idx mono">{i + 1}</div>
              <Field label="SKU code" tight>
                <input className="in" placeholder="e.g. ABC-001" value={s.skuCode}
                  onChange={(e) => setSku(s.id, { skuCode: e.target.value })} />
              </Field>
              <Field label="Description / type" tight>
                <input className="in" placeholder="e.g. 500ml PP tumbler, blue" value={s.description}
                  onChange={(e) => setSku(s.id, { description: e.target.value })} />
              </Field>
              <Field label="Quantity (pcs)" tight>
                <input className="in mono" type="number" min="0" placeholder="0" value={s.quantity}
                  onChange={(e) => setSku(s.id, { quantity: e.target.value })} />
              </Field>
              <button className="icon-btn" title="Remove SKU" onClick={() => rmSku(s.id)} disabled={skus.length === 1}>✕</button>
            </div>
          ))}
        </div>

        {err && <div className="hint bad big">{err}</div>}

        <div className="actions-row">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={submit}>Create request</button>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   PR detail
   ========================================================================= */
function PrDetail({ pr, role, onBack, updatePr, updateSku, deletePr }) {
  const [openSku, setOpenSku] = useState(pr.skus[0]?.id || null);
  const [confirmDel, setConfirmDel] = useState(false);

  const totals = useMemo(() => {
    let est = 0, act = 0, pieces = 0, actEntered = false;
    pr.skus.forEach((s) => {
      est += computeCogs(s.estimated, s.quantity).total;
      act += computeCogs(s.actual, s.quantity).total;
      pieces += num(s.quantity);
      if (hasAnyCost(s.actual)) actEntered = true;
    });
    const variance = actEntered ? act - est : null;
    const pct = actEntered && est > 0 ? (variance / est) * 100 : null;
    return { est, act, pieces, actEntered, variance, pct };
  }, [pr]);

  const addSku = () => {
    if (role !== "requester") return;
    const s = { id: uid(), skuCode: "", description: "", quantity: "0", estimated: emptyComponents(), actual: emptyComponents() };
    updatePr(pr.id, (p) => ({ ...p, skus: [...p.skus, s] }));
    setOpenSku(s.id);
  };
  const rmSku = (skuId) => role === "requester" && updatePr(pr.id, (p) => ({ ...p, skus: p.skus.filter((x) => x.id !== skuId) }));
  const setStatus = (status) => role === "factory" && updatePr(pr.id, (p) => ({ ...p, status }));

  return (
    <div>
      <button className="link back" onClick={onBack}>← All requests</button>

      <div className="detail-head">
        <div>
          <div className="detail-title">
            <span className="pr-num big">#{pr.prNumber}</span>
            <StatusPill status={pr.status} />
          </div>
          <p className="sub">Placed {pr.datePlaced} · {pr.skus.length} SKU{pr.skus.length === 1 ? "" : "s"} · {num(totals.pieces).toLocaleString("id-ID")} pcs{pr.note ? " · " + pr.note : ""}</p>
          {(pr.createdBy || pr.requesterLastEditedBy || pr.factoryLastEditedBy) && (
            <p className="audit-line">
              {pr.createdBy ? `Created by ${pr.createdBy}` : ""}
              {pr.requesterLastEditedBy ? ` · Estimate: ${pr.requesterLastEditedBy}` : ""}
              {pr.factoryLastEditedBy ? ` · Actual: ${pr.factoryLastEditedBy}` : ""}
            </p>
          )}
        </div>
        <div className="detail-actions">
          {role === "factory" ? (
            <label className="status-select">
              <span>Status</span>
              <select className="in" value={pr.status} onChange={(e) => setStatus(e.target.value)}>
                {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
          ) : (
            <div className="locked-note">Factory controls status</div>
          )}
          <button className="btn btn-ghost" onClick={() => exportCsv(pr)}>Export CSV</button>
        </div>
      </div>

      <div className="summary">
        <SummaryCell label="Estimated total" value={fmtRp(totals.est)} />
        <SummaryCell label="Actual total" value={totals.actEntered ? fmtRp(totals.act) : "—"} />
        <SummaryCell
          label="Variance"
          value={totals.variance == null ? "—" : fmtRp(totals.variance)}
          sub={totals.pct == null ? "" : fmtPct(totals.pct)}
          tone={totals.pct == null ? "" : totals.pct > 0 ? "bad" : "good"}
        />
      </div>

      <div className="sku-head">
        <div>
          <h3 className="h3">SKUs</h3>
          <div className="edit-scope">{role === "requester" ? "You can edit request details and estimated cost." : "You can edit actual cost and production status."}</div>
        </div>
        {role === "requester" && <button className="btn btn-ghost" onClick={addSku}>+ Add SKU</button>}
      </div>

      <div className="sku-cards">
        {pr.skus.map((s) => (
          <SkuCard
            key={s.id}
            sku={s}
            role={role}
            open={openSku === s.id}
            onToggle={() => setOpenSku(openSku === s.id ? null : s.id)}
            onChange={(patch) => updateSku(pr.id, s.id, (x) => ({ ...x, ...patch }))}
            onRemove={() => rmSku(s.id)}
            canRemove={role === "requester" && pr.skus.length > 1}
          />
        ))}
      </div>

      {role === "requester" && (
        <div className="danger-row">
          {confirmDel ? (
            <>
              <span className="muted">Delete request #{pr.prNumber} and all its SKUs?</span>
              <button className="btn btn-ghost" onClick={() => setConfirmDel(false)}>Keep</button>
              <button className="btn btn-danger" onClick={() => deletePr(pr.id)}>Delete request</button>
            </>
          ) : (
            <button className="link danger" onClick={() => setConfirmDel(true)}>Delete request</button>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryCell({ label, value, sub, tone = "" }) {
  return (
    <div className="sum-cell">
      <div className="sum-label">{label}</div>
      <div className={"sum-value mono" + (tone ? " " + tone : "")}>{value}</div>
      {sub && <div className={"sum-sub mono" + (tone ? " " + tone : "")}>{sub}</div>}
    </div>
  );
}

/* =========================================================================
   SKU card (estimate + actual)
   ========================================================================= */
function SkuCard({ sku, role, open, onToggle, onChange, onRemove, canRemove }) {
  const est = computeCogs(sku.estimated, sku.quantity);
  const act = computeCogs(sku.actual, sku.quantity);
  const actEntered = hasAnyCost(sku.actual);
  const perVar = actEntered ? act.cogsPerPc - est.cogsPerPc : null;
  const perPct = actEntered && est.cogsPerPc > 0 ? (perVar / est.cogsPerPc) * 100 : null;
  const requester = role === "requester";

  return (
    <div className={"card sku-card" + (open ? " open" : "")}>
      <button className="sku-card-head" onClick={onToggle} aria-expanded={open}>
        <div className="sku-card-id">
          <span className="chev" aria-hidden>{open ? "▾" : "▸"}</span>
          <div>
            <div className="sku-code">{sku.skuCode || "Untitled SKU"}</div>
            <div className="sku-desc muted">{sku.description || "No description"} · {num(sku.quantity).toLocaleString("id-ID")} pcs</div>
          </div>
        </div>
        <div className="sku-card-figs">
          <MiniFig label="Est / pc" value={fmtRp2(est.cogsPerPc)} />
          <MiniFig label="Actual / pc" value={actEntered ? fmtRp2(act.cogsPerPc) : "—"} />
          <MiniFig
            label="Var / pc"
            value={perPct == null ? "—" : fmtPct(perPct)}
            tone={perPct == null ? "" : perPct > 0 ? "bad" : "good"}
          />
        </div>
      </button>

      {open && (
        <div className="sku-card-body">
          <div className={"sku-meta" + (!requester ? " is-readonly" : "")}>
            <Field label="SKU code" tight>
              <input className="in" disabled={!requester} value={sku.skuCode} onChange={(e) => onChange({ skuCode: e.target.value })} />
            </Field>
            <Field label="Description / type" tight>
              <input className="in" disabled={!requester} value={sku.description} onChange={(e) => onChange({ description: e.target.value })} />
            </Field>
            <Field label="Quantity (pcs)" tight>
              <input className="in mono" disabled={!requester} type="number" min="0" value={sku.quantity} onChange={(e) => onChange({ quantity: e.target.value })} />
            </Field>
            {canRemove && <button className="icon-btn end" title="Remove SKU" onClick={onRemove}>✕</button>}
          </div>

          <div className="panels">
            <CostPanel
              title="Estimated cost"
              owner="Requester"
              highlight={requester}
              readOnly={!requester}
              comp={sku.estimated}
              qty={sku.quantity}
              breakdown={est}
              onChange={(c) => requester && onChange({ estimated: c })}
            />
            <CostPanel
              title="Actual cost"
              owner="Factory"
              highlight={!requester}
              readOnly={requester}
              comp={sku.actual}
              qty={sku.quantity}
              breakdown={act}
              compare={est}
              onChange={(c) => !requester && onChange({ actual: c })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function MiniFig({ label, value, tone = "" }) {
  return (
    <div className="minifig">
      <div className="minifig-label">{label}</div>
      <div className={"minifig-value mono" + (tone ? " " + tone : "")}>{value}</div>
    </div>
  );
}

/* =========================================================================
   Cost input panel — the component-by-component form
   ========================================================================= */
function CostPanel({ title, owner, highlight, readOnly, comp, qty, breakdown, compare, onChange }) {
  // helpers to update nested comp immutably
  const set = (patch) => onChange({ ...comp, ...patch });
  const setNested = (key, patch) => onChange({ ...comp, [key]: { ...comp[key], ...patch } });

  const b = breakdown;
  const inner = comp.innerbox;
  const master = comp.masterbox;
  const innerArea = blankAreaM2(inner);
  const masterArea = blankAreaM2(master);

  const line = (label, value, cmp) => (
    <div className="cost-line">
      <span className="cost-line-label">{label}</span>
      <span className="cost-line-val mono">{fmtRp2(value)}</span>
    </div>
  );

  return (
    <div className={"panel" + (highlight ? " panel-active" : "") + (readOnly ? " panel-readonly" : "")}>
      <div className="panel-head">
        <div>
          <div className="panel-title">{title}</div>
          <div className="panel-owner muted">{readOnly ? `${owner} controls this section` : "You can edit this section"}</div>
        </div>
        <div className="panel-cogs">
          <span className="panel-cogs-label">COGS / pc</span>
          <span className="panel-cogs-val mono">{fmtRp2(b.cogsPerPc)}</span>
        </div>
      </div>

      <div className="fields">
        {/* 1 · Material fee */}
        <div className="fgroup">
          <div className="fgroup-title">Material fee <span className="calc mono">{fmtRp2(b.material)}/pc</span></div>
          <div className="grid-3 tightgap">
            <Field label="Plastic" tight>
              <select className="in" disabled={readOnly} value={comp.material.plasticType} onChange={(e) => setNested("material", { plasticType: e.target.value })}>
                {PLASTICS.map((p) => <option key={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Material fee (Rp/pc)" tight>
              <input className="in mono" disabled={readOnly} type="number" min="0" value={comp.material.feePerPc} onChange={(e) => setNested("material", { feePerPc: e.target.value })} />
            </Field>
            <Field label="Rate used (Rp/kg)" tight>
              <input className="in mono" disabled={readOnly} type="number" min="0" value={comp.material.resinRateNote} onChange={(e) => setNested("material", { resinRateNote: e.target.value })} />
            </Field>
          </div>
          <div className="hint">Fee is entered directly (calculated off-platform). The rate is a reference note and isn't used in the total.</div>
        </div>

        {/* 2 · Inject fee */}
        <div className="fgroup">
          <div className="fgroup-title">Inject fee <span className="calc mono">{fmtRp2(b.inject)}/pc</span></div>
          <Field label="Inject fee (Rp/pc)" tight>
            <input className="in mono" disabled={readOnly} type="number" min="0" value={comp.injectPerPc} onChange={(e) => set({ injectPerPc: e.target.value })} />
          </Field>
        </div>

        {/* 3 · Inner box */}
        <BoxFields
          title="Inner box" per={b.inner} area={innerArea} box={inner} qtyLabel="Pcs per inner box"
          readOnly={readOnly} onChange={(patch) => setNested("innerbox", patch)}
        />

        {/* 4 · Master box */}
        <BoxFields
          title="Master box" per={b.master} area={masterArea} box={master} qtyLabel="Qty per master box"
          readOnly={readOnly} onChange={(patch) => setNested("masterbox", patch)}
        />

        {/* 5 · Bubble wrap */}
        <div className="fgroup">
          <div className="fgroup-title">Bubble wrap <span className="calc mono">{fmtRp2(b.bubble)}/pc</span></div>
          <Field label="Bubble wrap (Rp/pc)" tight>
            <input className="in mono" disabled={readOnly} type="number" min="0" value={comp.bubblewrapPerPc} onChange={(e) => set({ bubblewrapPerPc: e.target.value })} />
          </Field>
        </div>

        {/* 6 · Accessories */}
        <div className="fgroup">
          <div className="fgroup-title">Accessories <span className="calc mono">{fmtRp2(b.acc)}/pc</span></div>
          <div className="grid-acc">
            <Field label="Cost (Rp/pc)" tight>
              <input className="in mono" disabled={readOnly} type="number" min="0" value={comp.accessories.costPerPc} onChange={(e) => setNested("accessories", { costPerPc: e.target.value })} />
            </Field>
            <Field label="What is it?" tight>
              <input className="in" disabled={readOnly} placeholder="e.g. straw + silicone ring" value={comp.accessories.notes} onChange={(e) => setNested("accessories", { notes: e.target.value })} />
            </Field>
          </div>
        </div>

        {/* 7 · Other packaging */}
        <div className="fgroup">
          <div className="fgroup-title">Other packaging <span className="calc mono">{fmtRp2(b.other)}/pc</span></div>
          <div className="grid-acc">
            <Field label="Cost (Rp/pc)" tight>
              <input className="in mono" disabled={readOnly} type="number" min="0" value={comp.otherPackaging.costPerPc} onChange={(e) => setNested("otherPackaging", { costPerPc: e.target.value })} />
            </Field>
            <Field label="Sticker, polybag…" tight>
              <input className="in" disabled={readOnly} placeholder="e.g. barcode sticker + polybag" value={comp.otherPackaging.notes} onChange={(e) => setNested("otherPackaging", { notes: e.target.value })} />
            </Field>
          </div>
        </div>

        {/* Assembly — kept because it feeds COGS */}
        <div className="fgroup">
          <div className="fgroup-title">Assembly <span className="calc mono">{fmtRp2(b.assembly)}/pc</span></div>
          <Field label="Assembly (Rp/pc)" tight>
            <input className="in mono" disabled={readOnly} type="number" min="0" value={comp.assemblyPerPc} onChange={(e) => set({ assemblyPerPc: e.target.value })} />
          </Field>
        </div>

        {/* Reject allowance — kept because it feeds COGS */}
        <div className="fgroup">
          <div className="fgroup-title">Reject allowance <span className="calc mono">{fmtRp2(b.reject)}/pc</span></div>
          <Field label="Reject %" tight>
            <input className="in mono" disabled={readOnly} type="number" min="0" value={comp.rejectPct} onChange={(e) => set({ rejectPct: e.target.value })} />
          </Field>
        </div>
      </div>

      {/* Breakdown / totals */}
      <div className="breakdown">
        {line("Material", b.material)}
        {line("Inject", b.inject)}
        {line("Inner box", b.inner)}
        {line("Master box", b.master)}
        {line("Bubble wrap", b.bubble)}
        {line("Assembly", b.assembly)}
        {line("Accessories", b.acc)}
        {line("Other packaging", b.other)}
        <div className="cost-line sub">
          <span className="cost-line-label">Subtotal / pc</span>
          <span className="cost-line-val mono">{fmtRp2(b.subtotal)}</span>
        </div>
        <div className="cost-line">
          <span className="cost-line-label">Reject ({num(comp.rejectPct)}%)</span>
          <span className="cost-line-val mono">{fmtRp2(b.reject)}</span>
        </div>
        <div className="cost-line total">
          <span className="cost-line-label">COGS / pc</span>
          <span className="cost-line-val mono">{fmtRp2(b.cogsPerPc)}</span>
        </div>
        <div className="cost-line total">
          <span className="cost-line-label">Total ({num(qty).toLocaleString("id-ID")} pcs)</span>
          <span className="cost-line-val mono">{fmtRp(b.total)}</span>
        </div>
        {compare && hasAnyCost(comp) && (
          <div className="cost-line compare">
            <span className="cost-line-label">vs estimate</span>
            <span className={"cost-line-val mono " + (b.total - compare.total > 0 ? "bad" : "good")}>
              {(b.total - compare.total >= 0 ? "+" : "") + fmtRp(b.total - compare.total)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function BoxFields({ title, per, area, box, qtyLabel, readOnly, onChange }) {
  return (
    <div className="fgroup">
      <div className="fgroup-title">{title} <span className="calc mono">{fmtRp2(per)}/pc</span></div>
      <div className="grid-box">
        <Field label="Flute" tight>
          <select className="in" disabled={readOnly} value={box.flute} onChange={(e) => onChange({ flute: e.target.value })}>
            {FLUTES.map((f) => <option key={f}>{f}</option>)}
          </select>
        </Field>
        <Field label="Size / code" tight>
          <input className="in" disabled={readOnly} placeholder="e.g. A3" value={box.sizeLabel} onChange={(e) => onChange({ sizeLabel: e.target.value })} />
        </Field>
        <Field label="L (cm)" tight>
          <input className="in mono" disabled={readOnly} type="number" min="0" value={box.L} onChange={(e) => onChange({ L: e.target.value })} />
        </Field>
        <Field label="W (cm)" tight>
          <input className="in mono" disabled={readOnly} type="number" min="0" value={box.W} onChange={(e) => onChange({ W: e.target.value })} />
        </Field>
        <Field label="H (cm)" tight>
          <input className="in mono" disabled={readOnly} type="number" min="0" value={box.H} onChange={(e) => onChange({ H: e.target.value })} />
        </Field>
        <Field label="Price (Rp/box)" tight>
          <input className="in mono" disabled={readOnly} type="number" min="0" value={box.unitPrice} onChange={(e) => onChange({ unitPrice: e.target.value })} />
        </Field>
        <Field label={qtyLabel || "Pcs per box"} tight>
          <input className="in mono" disabled={readOnly} type="number" min="0" value={box.pcsPerBox} onChange={(e) => onChange({ pcsPerBox: e.target.value })} />
        </Field>
      </div>
      {area > 0 && <div className="hint">Board area ≈ <span className="mono">{area.toFixed(3)} m²</span> per box (RSC reference)</div>}
    </div>
  );
}

/* =========================================================================
   Field wrapper
   ========================================================================= */
function Field({ label, children, tight }) {
  return (
    <label className={"field" + (tight ? " tight" : "")}>
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

/* =========================================================================
   Methodology (in-app, cited)
   ========================================================================= */
function Methodology() {
  const [open, setOpen] = useState(false);
  return (
    <div className="method">
      <button className="method-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? "▾" : "▸"} How each cost is calculated
      </button>
      {open && (
        <div className="method-body">
          <p><b>Material fee</b> is entered directly per piece (calculated off-platform). The Rp/kg rate is recorded for reference only and doesn't affect the total.</p>
          <p><b>Inner / master box</b> = box unit price ÷ quantity per box. The L·W·H you enter also drives a reference RSC board area = [(L+W)×2 + 8] × (W+H+4) cm², so you can sanity-check the price against material used.</p>
          <p><b>Inject, bubble wrap, assembly, accessories, other packaging</b> are entered directly per piece.</p>
          <p><b>Reject</b> = subtotal × reject %. Adds a scrap allowance on top of the per-piece cost (default 3%).</p>
          <p><b>COGS / pc</b> = subtotal + reject. <b>Total</b> = COGS / pc × quantity.</p>
          <p className="method-note">Sources: injection material-cost formula and corrugated RSC blank-area formula are industry-standard references. Reject can be switched to the yield-accurate form subtotal ÷ (1 − reject %) if you prefer.</p>
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   CSV export
   ========================================================================= */
function exportCsv(pr) {
  const head = [
    "PR", "Date", "Status", "SKU", "Description", "Qty",
    "Est material/pc", "Est rate used (Rp/kg)", "Est inject/pc", "Est innerbox/pc", "Est masterbox/pc", "Est bubble/pc",
    "Est assembly/pc", "Est accessories/pc", "Est other/pc", "Est reject/pc", "Est COGS/pc", "Est total",
    "Act material/pc", "Act rate used (Rp/kg)", "Act inject/pc", "Act innerbox/pc", "Act masterbox/pc", "Act bubble/pc",
    "Act assembly/pc", "Act accessories/pc", "Act other/pc", "Act reject/pc", "Act COGS/pc", "Act total",
    "Variance total", "Variance %",
  ];
  const rows = pr.skus.map((s) => {
    const e = computeCogs(s.estimated, s.quantity);
    const a = computeCogs(s.actual, s.quantity);
    const v = a.total - e.total;
    const pct = e.total > 0 ? (v / e.total) * 100 : 0;
    const r = (n) => Math.round(num(n));
    return [
      pr.prNumber, pr.datePlaced, pr.status, s.skuCode, s.description, num(s.quantity),
      r(e.material), num(s.estimated.material.resinRateNote), r(e.inject), r(e.inner), r(e.master), r(e.bubble), r(e.assembly), r(e.acc), r(e.other), r(e.reject), r(e.cogsPerPc), r(e.total),
      r(a.material), num(s.actual.material.resinRateNote), r(a.inject), r(a.inner), r(a.master), r(a.bubble), r(a.assembly), r(a.acc), r(a.other), r(a.reject), r(a.cogsPerPc), r(a.total),
      r(v), pct.toFixed(1),
    ];
  });
  const esc = (x) => {
    const str = String(x);
    return /[",\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
  };
  const csv = [head, ...rows].map((row) => row.map(esc).join(",")).join("\n");
  try {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "PR-" + pr.prNumber + "-cogs.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error("export failed", e);
  }
}

/* =========================================================================
   Styles
   ========================================================================= */
const CSS = `
:root{
  --bg:#E8ECEA; --surface:#ffffff; --surface-2:#F4F7F5; --surface-3:#EEF2F0;
  --ink:#16211D; --ink-2:#4C5A55; --ink-3:#7A867F;
  --line:#D4DBD7; --line-2:#E3E8E5;
  --primary:#27508E; --primary-ink:#ffffff; --primary-soft:#E9F0FA;
  --good:#15704F; --good-soft:#E3F1EA; --bad:#B54227; --bad-soft:#FAE9E3; --warn:#8A5F16; --warn-soft:#F5EBD5;
  --radius:12px;
  --sans:"Space Grotesk", ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  --body: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  --mono: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace;
}
*{box-sizing:border-box}
.app{min-height:100vh;background:var(--bg);color:var(--ink);font-family:var(--body);font-size:14px;line-height:1.45;-webkit-font-smoothing:antialiased}
.wrap{max-width:1100px;margin:0 auto;padding:24px 20px 60px}
.pad{padding:20px}
.mono{font-family:var(--mono);font-variant-numeric:tabular-nums;letter-spacing:-0.01em}
.muted{color:var(--ink-3)}
.good{color:var(--good)!important}
.bad{color:var(--bad)!important}
.r{text-align:right}

/* top bar */
.topbar{background:var(--ink);color:#fff;position:sticky;top:0;z-index:20;
  background-image:linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px),
                   linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px);
  background-size:22px 22px}
.topbar-inner{max-width:1100px;margin:0 auto;padding:0 20px;height:58px;display:flex;align-items:center;justify-content:space-between}
.brand{display:flex;align-items:center;gap:10px;background:none;border:0;color:#fff;cursor:pointer;padding:6px 0}
.brand-mark{font-size:18px;color:#9EC0F0}
.brand-name{font-family:var(--sans);font-weight:600;font-size:16px;letter-spacing:.01em}
.topbar-right{display:flex;align-items:center;gap:14px}
.role{display:flex;align-items:center;gap:10px}
.role-label{font-size:12px;color:rgba(255,255,255,.6)}
.seg{display:inline-flex;background:rgba(255,255,255,.10);border-radius:999px;padding:3px}
.seg.small{background:var(--surface-3)}
.seg-btn{border:0;background:none;color:rgba(255,255,255,.75);padding:5px 14px;border-radius:999px;cursor:pointer;font-size:13px;font-family:var(--body)}
.seg.small .seg-btn{color:var(--ink-2)}
.seg-btn.on{background:#fff;color:var(--ink)}
.seg.small .seg-btn.on{background:var(--ink);color:#fff}

/* banner */
.banner{background:var(--warn-soft);border:1px solid #E7D3A3;color:#6E5210;padding:10px 14px;border-radius:10px;margin-bottom:18px;font-size:13px}

/* page head */
.page-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:20px}
.h1{font-family:var(--sans);font-size:26px;font-weight:600;margin:0;letter-spacing:-.01em}
.sub{color:var(--ink-2);margin:4px 0 0;max-width:60ch}
.h3{font-family:var(--sans);font-size:16px;font-weight:600;margin:0}

/* buttons */
.btn{border-radius:9px;padding:9px 16px;font-size:14px;cursor:pointer;font-family:var(--body);border:1px solid transparent;font-weight:500;transition:background .12s,border-color .12s}
.btn-primary{background:var(--primary);color:#fff}
.btn-primary:hover{background:#1E4076}
.btn-ghost{background:var(--surface);border-color:var(--line);color:var(--ink)}
.btn-ghost:hover{border-color:var(--ink-3)}
.btn-danger{background:var(--bad);color:#fff}
.btn-danger:hover{background:#963517}
.link{background:none;border:0;color:var(--primary);cursor:pointer;padding:0;font-size:14px;font-family:var(--body)}
.link:hover{text-decoration:underline}
.link.back{display:inline-block;margin-bottom:14px;color:var(--ink-2)}
.link.danger{color:var(--bad)}
.icon-btn{background:none;border:1px solid var(--line);border-radius:8px;width:34px;height:34px;cursor:pointer;color:var(--ink-3);flex:none}
.icon-btn:hover:not(:disabled){border-color:var(--bad);color:var(--bad)}
.icon-btn:disabled{opacity:.35;cursor:not-allowed}
.icon-btn.end{align-self:end}

/* kpis */
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:22px}
.kpi{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:14px 16px}
.kpi-label{font-size:12px;color:var(--ink-3);margin-bottom:6px}
.kpi-value{font-size:22px;font-weight:600;font-family:var(--sans)}
.kpi-value.mono{font-family:var(--mono);letter-spacing:-.02em}

/* toolbar */
.toolbar{display:flex;gap:12px;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap}
.search{flex:1;min-width:200px;max-width:340px;border:1px solid var(--line);border-radius:9px;padding:9px 12px;font-size:14px;background:var(--surface);font-family:var(--body)}
.search:focus{outline:2px solid var(--primary-soft);border-color:var(--primary)}

/* table */
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius)}
.table-card{overflow:auto}
.table{width:100%;border-collapse:collapse;font-size:14px}
.table th{text-align:left;font-weight:500;color:var(--ink-3);font-size:12px;padding:12px 16px;border-bottom:1px solid var(--line);background:var(--surface-2)}
.table td{padding:13px 16px;border-bottom:1px solid var(--line-2)}
.table tr:last-child td{border-bottom:0}
.row{cursor:pointer}
.row:hover{background:var(--surface-2)}
.row:focus-visible{outline:2px solid var(--primary);outline-offset:-2px}
.pr-num{font-family:var(--mono);font-weight:600;color:var(--primary)}
.pr-num.big{font-size:24px;font-family:var(--sans)}

/* pills */
.pill{display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:500}
.pill-estimated{background:var(--surface-3);color:var(--ink-2)}
.pill-in_production{background:var(--primary-soft);color:var(--primary)}
.pill-completed{background:var(--good-soft);color:var(--good)}

/* empty */
.empty{background:var(--surface);border:1px dashed var(--line);border-radius:var(--radius);padding:48px 24px;text-align:center;max-width:520px;margin:0 auto}
.empty-mark{font-size:34px;color:var(--line);margin-bottom:8px}
.empty h3{font-family:var(--sans);font-size:18px;margin:0 0 6px}
.empty p{color:var(--ink-2);margin:0 auto 18px;max-width:44ch}

/* fields */
.field{display:flex;flex-direction:column;gap:5px}
.field-label{font-size:12px;color:var(--ink-2)}
.field.tight .field-label{font-size:11.5px}
.in{border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-size:14px;background:var(--surface);width:100%;font-family:var(--body);color:var(--ink)}
.in.mono{font-family:var(--mono)}
.in:focus{outline:2px solid var(--primary-soft);border-color:var(--primary)}
.in-err{border-color:var(--bad)}
.grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.tightgap{gap:10px}
.hint{font-size:12px;color:var(--ink-3);margin-top:4px}
.hint.bad{color:var(--bad)}
.hint.big{margin-top:12px;font-size:13px}

/* new request sku lines */
.sku-head{display:flex;justify-content:space-between;align-items:center;margin:26px 0 12px}
.sku-list{display:flex;flex-direction:column;gap:10px}
.sku-line{display:grid;grid-template-columns:26px 1.1fr 1.6fr .9fr 34px;gap:10px;align-items:end}
.sku-idx{color:var(--ink-3);text-align:center;padding-bottom:9px}
.actions-row{display:flex;justify-content:flex-end;gap:10px;margin-top:22px}

/* detail */
.detail-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:18px;flex-wrap:wrap}
.detail-title{display:flex;align-items:center;gap:12px}
.detail-actions{display:flex;align-items:flex-end;gap:10px}
.status-select{display:flex;flex-direction:column;gap:5px;font-size:12px;color:var(--ink-2)}
.status-select .in{min-width:150px}

.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:8px}
.sum-cell{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:14px 16px}
.sum-label{font-size:12px;color:var(--ink-3);margin-bottom:5px}
.sum-value{font-size:20px;font-weight:600}
.sum-sub{font-size:13px;margin-top:2px}

/* sku cards */
.sku-cards{display:flex;flex-direction:column;gap:12px}
.sku-card{overflow:hidden}
.sku-card-head{width:100%;display:flex;justify-content:space-between;align-items:center;gap:14px;padding:14px 18px;background:none;border:0;cursor:pointer;text-align:left}
.sku-card.open .sku-card-head{border-bottom:1px solid var(--line-2)}
.sku-card-id{display:flex;align-items:center;gap:12px}
.chev{color:var(--ink-3);font-size:12px;width:12px}
.sku-code{font-family:var(--sans);font-weight:600;font-size:15px}
.sku-desc{font-size:12.5px;margin-top:1px}
.sku-card-figs{display:flex;gap:22px}
.minifig{text-align:right}
.minifig-label{font-size:11px;color:var(--ink-3)}
.minifig-value{font-size:14px;font-weight:600}
.sku-card-body{padding:16px 18px 20px}
.sku-meta{display:grid;grid-template-columns:1fr 1.6fr .8fr auto;gap:12px;align-items:end;margin-bottom:18px;padding-bottom:16px;border-bottom:1px solid var(--line-2)}

/* panels */
.panels{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.panel{background:var(--surface-2);border:1px solid var(--line);border-radius:var(--radius);padding:14px}
.panel-active{border-color:var(--primary);box-shadow:0 0 0 3px var(--primary-soft)}
.panel-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px}
.panel-title{font-family:var(--sans);font-weight:600;font-size:15px}
.panel-owner{font-size:12px}
.panel-cogs{text-align:right}
.panel-cogs-label{display:block;font-size:11px;color:var(--ink-3)}
.panel-cogs-val{font-size:17px;font-weight:600}
.fields{display:flex;flex-direction:column;gap:14px}
.fgroup{background:var(--surface);border:1px solid var(--line-2);border-radius:9px;padding:11px 12px}
.fgroup-title{font-size:12px;font-weight:600;color:var(--ink-2);margin-bottom:9px;display:flex;justify-content:space-between;align-items:center}
.calc{color:var(--primary);font-weight:500;font-size:12px}
.fgroup.row2{display:grid;grid-template-columns:1fr 1fr;gap:12px;background:none;border:0;padding:0}
.grid-box{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}
.grid-acc{display:grid;grid-template-columns:.8fr 1.6fr;gap:10px}

/* breakdown */
.breakdown{margin-top:14px;border-top:1px solid var(--line-2);padding-top:10px}
.cost-line{display:flex;justify-content:space-between;padding:3px 0;font-size:13px;color:var(--ink-2)}
.cost-line-val{color:var(--ink)}
.cost-line.sub{border-top:1px dashed var(--line);margin-top:5px;padding-top:7px;font-weight:500;color:var(--ink)}
.cost-line.total{font-weight:600;color:var(--ink);font-size:14px}
.cost-line.total .cost-line-val{color:var(--ink)}
.cost-line.compare{margin-top:5px;border-top:1px solid var(--line-2);padding-top:7px;font-weight:600}

/* danger */
.danger-row{display:flex;align-items:center;gap:12px;margin-top:26px;justify-content:flex-end}

/* method */
.method{margin-top:26px}
.method-toggle{background:none;border:0;color:var(--ink-2);cursor:pointer;font-size:13px;font-family:var(--body);padding:6px 0}
.method-toggle:hover{color:var(--ink)}
.method-body{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:14px 18px;margin-top:6px;font-size:13px;color:var(--ink-2);max-width:80ch}
.method-body p{margin:0 0 8px}
.method-body b{color:var(--ink)}
.method-note{font-size:12px;color:var(--ink-3);border-top:1px solid var(--line-2);padding-top:8px;margin-top:4px!important}


/* auth + permissions */
.login-shell{min-height:100vh;display:grid;place-items:center;padding:28px 18px;background:var(--bg);position:relative;overflow:hidden}
.login-shell:before{content:"";position:absolute;inset:0;background-image:linear-gradient(90deg,rgba(22,33,29,.035) 1px,transparent 1px),linear-gradient(rgba(22,33,29,.035) 1px,transparent 1px);background-size:26px 26px;pointer-events:none}
.login-card{position:relative;width:min(620px,100%);background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:30px;box-shadow:0 18px 50px rgba(22,33,29,.10)}
.login-brand{display:flex;align-items:center;gap:9px;font-family:var(--sans);font-weight:600;color:var(--ink);margin-bottom:28px}
.login-brand .brand-mark{color:var(--primary)}
.login-title{font-family:var(--sans);font-size:30px;line-height:1.15;letter-spacing:-.025em;margin:0 0 8px}
.login-sub{color:var(--ink-2);margin:0 0 22px;max-width:56ch}
.role-cards{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px}
.role-card{background:var(--surface-2);border:1px solid var(--line);border-radius:12px;padding:16px;text-align:left;cursor:pointer;color:var(--ink);transition:border-color .12s,box-shadow .12s,background .12s}
.role-card:hover{border-color:var(--ink-3)}
.role-card.selected{border-color:var(--primary);background:var(--primary-soft);box-shadow:0 0 0 3px rgba(39,80,142,.08)}
.role-card-title{display:block;font-family:var(--sans);font-weight:600;font-size:16px;margin-bottom:5px}
.role-card-copy{display:block;color:var(--ink-2);font-size:12.5px;line-height:1.45}
.login-form{display:flex;flex-direction:column;gap:13px}
.login-input{padding:10px 12px}
.login-submit{width:100%;margin-top:2px;padding:11px 16px}
.login-submit:disabled{opacity:.6;cursor:wait}
.login-error{background:var(--bad-soft);color:var(--bad);border:1px solid #efc5b8;border-radius:8px;padding:9px 11px;font-size:13px}
.factory-note{background:var(--surface-2);border:1px solid var(--line-2);border-radius:8px;padding:9px 11px;color:var(--ink-2);font-size:12px}
.signed-user{display:flex;align-items:center;gap:8px;padding:4px 10px;border:1px solid rgba(255,255,255,.14);border-radius:999px}
.signed-name{font-size:13px;color:#fff;font-weight:500}
.signed-role{font-size:11px;color:#b8c9c1;border-left:1px solid rgba(255,255,255,.16);padding-left:8px}
.top-action{border:0;background:none;color:rgba(255,255,255,.72);font-size:12px;cursor:pointer;padding:7px 4px}
.top-action:hover{color:#fff}
.role-help{font-size:12px;color:var(--ink-3);background:var(--surface);border:1px solid var(--line);border-radius:999px;padding:7px 11px}
.banner-bad{background:var(--bad-soft);border-color:#efc5b8;color:var(--bad)}
.in:disabled{background:var(--surface-3);color:var(--ink-3);cursor:not-allowed;border-color:var(--line-2)}
.panel-readonly{opacity:.82}
.panel-readonly .fgroup{background:#f8faf9}
.locked-note{font-size:12px;color:var(--ink-3);border:1px solid var(--line);background:var(--surface-2);border-radius:8px;padding:9px 11px}
.edit-scope{font-size:12px;color:var(--ink-3);margin-top:3px}
.audit-line{font-size:11.5px;color:var(--ink-3);margin:5px 0 0}
.is-readonly{opacity:.86}

@media (max-width:860px){
  .role-cards{grid-template-columns:1fr}
  .login-card{padding:22px}
  .topbar-inner{height:auto;min-height:58px;padding-top:8px;padding-bottom:8px}
  .topbar-right{gap:9px}
  .kpis{grid-template-columns:repeat(2,1fr)}
  .panels{grid-template-columns:1fr}
  .summary{grid-template-columns:1fr}
  .grid-3{grid-template-columns:1fr 1fr}
  .sku-line{grid-template-columns:1fr 1fr;row-gap:8px}
  .sku-idx{display:none}
  .sku-meta{grid-template-columns:1fr 1fr}
  .sku-card-figs{gap:14px}
  .table{font-size:13px}
  .table th:nth-child(2),.table td:nth-child(2){display:none}
}

@media (max-width:600px){
  .wrap{padding:18px 12px 48px}
  .topbar-inner{flex-wrap:wrap;justify-content:center}
  .brand{width:100%;justify-content:center}
  .topbar-right{width:100%;justify-content:center}
  .kpis{grid-template-columns:1fr}
  .grid-3,.grid-box,.grid-acc{grid-template-columns:1fr}
  .sku-meta{grid-template-columns:1fr}
  .sku-card-head{align-items:flex-start;flex-direction:column}
  .sku-card-figs{width:100%;justify-content:space-between}
  .login-title{font-size:25px}
}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`;
