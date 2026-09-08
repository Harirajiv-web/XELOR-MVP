import type { ScreenProps } from "@spine/registry/manifest";
import { ManagedServicesWorkspace } from "../workspace";
export default function IncidentsScreen(
  _props: ScreenProps,
): React.JSX.Element {
  return <ManagedServicesWorkspace view="incidents" />;
}
