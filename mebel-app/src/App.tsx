import { STAGES, STAGE_ROLE } from "./stages";

/**
 * Доска заказов: колонка на каждый этап. Данных пока нет (база подключается на следующем шаге),
 * поэтому каждая колонка показывает пустое состояние, а не выдуманные заказы.
 */
export default function App() {
  return (
    <main className="screen">
      <header className="screen__header">
        <h1 className="screen__title">Заказы</h1>
      </header>
      <div className="board" role="list">
        {STAGES.map((stage) => (
          <section className="column" role="listitem" key={stage} aria-label={stage}>
            <header className="column__header">
              <h2 className="column__title">{stage}</h2>
              <span className="column__role">{STAGE_ROLE[stage]}</span>
            </header>
            <p className="column__empty">Заказов на этапе нет</p>
          </section>
        ))}
      </div>
    </main>
  );
}
