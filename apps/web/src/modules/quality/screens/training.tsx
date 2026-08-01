import type { ScreenProps } from "@spine/registry/manifest";
import { QmsWorkspace } from "../workspace";

export default function TrainingScreen(_props: ScreenProps): React.JSX.Element {
  return <QmsWorkspace view="training" />;
}
