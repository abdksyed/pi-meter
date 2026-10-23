import type { ToolExecutionData } from "../../lib/sessionTypes";
import { ToolCallBlock } from "./ToolCallBlock";
import { ToolResultBlock } from "./ToolResultBlock";

interface ToolExecutionProps {
  execution: ToolExecutionData;
  itemKey: string;
}

export function ToolExecution({ execution, itemKey }: ToolExecutionProps) {
  return (
    <div className="pm-tool-execution" id={execution.key}>
      <h4 className="pm-sr-only">
        Tool call {execution.name}
        {execution.results.length > 0 ? `, ${execution.results.length} result${execution.results.length === 1 ? "" : "s"}` : ", no result"}
      </h4>
      <ToolCallBlock execution={execution} itemKey={itemKey} />
      {execution.results.length > 0 ? (
        execution.results.map((result, index) => (
          <ToolResultBlock
            key={result.key}
            result={result}
            toolName={execution.name}
            itemKey={itemKey}
            args={execution.arguments}
            index={index}
          />
        ))
      ) : (
        <p className="pm-tool__pending">No result recorded for this call.</p>
      )}
    </div>
  );
}
