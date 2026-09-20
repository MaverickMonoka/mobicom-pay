export default function Home(){
  return <main className="shell">
    <header className="topbar"><span className="brand"><span className="mark">M</span>MOBICOM PAY</span><span className="badge">Payment orchestration</span></header>
    <section className="card" style={{maxWidth:820,margin:"72px auto"}}>
      <div className="eyebrow">MOBICOM X PAYMENT INFRASTRUCTURE</div>
      <h1>One secure payment rail for every Mobicom product.</h1>
      <p className="muted">Mobicom Pay provides a merchant API, hosted checkout, verified provider notifications, a payment ledger and signed application webhooks.</p>
      <div className="row"><span className="muted">API</span><strong>/api/v1/payments</strong></div>
      <div className="row"><span className="muted">SHESHA adapter</span><strong>/v1/checkout/sessions</strong></div>
      <div className="row"><span className="muted">Health</span><strong>/api/v1/health</strong></div>
    </section>
  </main>
}
