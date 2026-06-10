import type { CalendarEvent } from "../state/appState";

type CalendarTimelineProps = {
  events: CalendarEvent[];
};

export function CalendarTimeline({ events }: CalendarTimelineProps) {
  return (
    <div className="timeline">
      {events.map((event) => (
        <article className="timeline-item" key={event.id}>
          <span className="timeline-time">{event.startsAt}</span>
          <div>
            <h3>{event.title}</h3>
            <p>{event.source}</p>
          </div>
        </article>
      ))}
    </div>
  );
}
