import useAddTaskPanelController from "./add-task-panel/useAddTaskPanelController";
import AddTaskPanelView from "./add-task-panel/AddTaskPanelView";

export default function AddTaskPanel(props) {
  const controller = useAddTaskPanelController(props);
  return <AddTaskPanelView controller={controller} />;
}
