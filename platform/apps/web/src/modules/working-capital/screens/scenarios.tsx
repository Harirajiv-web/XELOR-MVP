import type { ScreenProps } from "@spine/registry/manifest";
import { WorkingCapitalWorkspace } from "../workspace";

export default function ScenariosScreen(_props: ScreenProps): React.JSX.Element {
  return <WorkingCapitalWorkspace view="scenarios" />;
}
