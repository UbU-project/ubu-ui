import { CalendarTimeline } from "../components/CalendarTimeline";
import type { CalendarEvent } from "../state/appState";

type CalendarPreviewProps = {
  events: CalendarEvent[];
};

export function CalendarPreview({ events }: CalendarPreviewProps) {
  return (
    <section className="route-stack">
      <div>
        <div className="section-kicker">Calendar</div>
        <h1>Calendar preview</h1>
        <p className="muted">Calendar context is inspectable before it influences task ordering.</p>
      </div>
      <CalendarTimeline events={events} />
    </section>
  );
}
