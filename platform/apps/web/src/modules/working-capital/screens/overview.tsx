import type { ScreenProps } from "@spine/registry/manifest";
import { WorkingCapitalWorkspace } from "../workspace";

export default function OverviewScreen(_props: ScreenProps): React.JSX.Element {
  return <WorkingCapitalWorkspace view="overview" />;
}
