import type { ScreenProps } from "@spine/registry/manifest";
import { ManagedServicesWorkspace } from "../workspace";
export default function CommandCentreScreen(
  _props: ScreenProps,
): React.JSX.Element {
  return <ManagedServicesWorkspace view="command-centre" />;
}
