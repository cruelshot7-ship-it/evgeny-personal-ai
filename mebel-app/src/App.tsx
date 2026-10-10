export default function App() {
  return (
    <main className="screen">
      <header className="screen__header">
        <h1 className="screen__title">Заказы</h1>
      </header>
      <section className="empty" aria-live="polite">
        <p className="empty__text">Открытых заказов пока нет.</p>
        <p className="empty__hint">Список появится после подключения базы.</p>
      </section>
    </main>
  );
}
