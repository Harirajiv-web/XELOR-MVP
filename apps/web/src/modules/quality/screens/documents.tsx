import type { ScreenProps } from "@spine/registry/manifest";
import { QmsWorkspace } from "../workspace";

export default function DocumentsScreen(_props: ScreenProps): React.JSX.Element {
  return <QmsWorkspace view="documents" />;
}
