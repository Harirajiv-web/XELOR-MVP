import type { ScreenProps } from "@spine/registry/manifest";
import { QmsWorkspace } from "../workspace";

export default function OverviewScreen(_props: ScreenProps): React.JSX.Element {
  return <QmsWorkspace view="overview" />;
}
