/** Re-mounted on every navigation, so each page fades in (opacity only; see .page-in in globals.css). */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-in">{children}</div>;
}
