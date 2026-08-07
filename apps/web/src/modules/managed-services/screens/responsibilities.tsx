import type { ScreenProps } from "@spine/registry/manifest";
import { ManagedServicesWorkspace } from "../workspace";
export default function ResponsibilitiesScreen(
  _props: ScreenProps,
): React.JSX.Element {
  return <ManagedServicesWorkspace view="responsibilities" />;
}
