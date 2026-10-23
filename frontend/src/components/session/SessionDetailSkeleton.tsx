export function SessionDetailSkeleton() {
  return (
    <div className="pm-skeleton" aria-busy="true" aria-label="Loading session">
      <div className="pm-skeleton__line pm-skeleton__line--sm" />
      <div className="pm-skeleton__line pm-skeleton__line--title" />
      <div className="pm-skeleton__line pm-skeleton__line--meta" />
      <div className="pm-skeleton__cost">
        {Array.from({ length: 6 }, (_, index) => (
          <div className="pm-skeleton__block" key={index} />
        ))}
      </div>
      {Array.from({ length: 3 }, (_, index) => (
        <div className="pm-skeleton__entry" key={index}>
          <div className="pm-skeleton__line pm-skeleton__line--sm" />
          <div className="pm-skeleton__line" />
          <div className="pm-skeleton__line" />
          <div className="pm-skeleton__line pm-skeleton__line--short" />
        </div>
      ))}
    </div>
  );
}
