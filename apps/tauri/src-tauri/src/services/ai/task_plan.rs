// Planning is local metadata. It never executes a command or grants access.
const TASK_PLAN_TOOL: &str = "transterm_update_plan";
const TASK_AGENT_PROMPT: &str = "Work as a task-solving agent on the approved target. For a multi-step request, use transterm_update_plan to publish a short actionable plan, then inspect, implement, and verify without waiting for the user to say continue between successful steps. Keep at most one step in-progress and update progress after meaningful results. Include verification in the plan. A request to explain something needs a direct answer, not unnecessary execution. Use existing command and file tools for actual work; planning never grants permission. Respect all approval, cancellation, target and REA boundaries. Recover from ordinary nonzero command exits only when the tool status is executed and the evidence makes the next action safe; never repeat a mutation with uncertain outcome. If blocked by missing input, unavailable permissions, rejected execution or a changed target, report the blocker and wait. Do not mark a step completed until evidence supports it. When finished, give a concise account of changes, checks and unresolved limits. Never claim tests passed merely because you planned them.";

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct TaskPlanArguments {
    steps: Vec<AiTaskStep>,
    explanation: String,
    blocked: bool,
}

fn task_plan_definition(kind: AiProviderKind) -> Value {
    let parameters = json!({
        "type": "object",
        "properties": {
            "steps": {"type":"array", "items": {
                "type":"object", "properties": {
                    "title":{"type":"string"},
                    "status":{"type":"string","enum":["pending","in-progress","completed"]}
                }, "required":["title","status"], "additionalProperties":false
            }},
            "explanation":{"type":"string","description":"Brief progress evidence or blocker. Never include secrets."},
            "blocked":{"type":"boolean","description":"True only when user input/action is needed; stops automatic execution."}
        },
        "required":["steps","explanation","blocked"], "additionalProperties":false
    });
    let description = "Publish or update the task plan (1–12 concise steps, at most one in-progress). Keep unfinished work visible, include verification, and mark completed only with evidence. This updates local progress only; it does not execute anything or bypass approvals. Set blocked=true with a reason when you need the user to act.";
    match kind {
        AiProviderKind::OpenaiCompatibleChat => json!({"type":"function","function":{
            "name":TASK_PLAN_TOOL,"description":description,"parameters":parameters,"strict":true
        }}),
        AiProviderKind::OpenaiResponses => json!({"type":"function","name":TASK_PLAN_TOOL,
            "description":description,"parameters":parameters,"strict":true}),
        AiProviderKind::AnthropicMessages => json!({"name":TASK_PLAN_TOOL,
            "description":description,"input_schema":parameters}),
    }
}

fn parse_task_plan(arguments: &str) -> Result<TaskPlanArguments, AppError> {
    if arguments.len() > 12 * 1024 {
        return Err(ai_error("AI_TOOL_CALL_INVALID", "任务计划过长"));
    }
    let mut value: Value = serde_json::from_str(arguments)
        .map_err(|_| ai_error("AI_TOOL_CALL_INVALID", "任务计划不是有效 JSON"))?;
    sanitize_rea_value(&mut value, 0);
    let args: TaskPlanArguments = serde_json::from_value(value)
        .map_err(|_| ai_error("AI_TOOL_CALL_INVALID", "任务计划字段无效"))?;
    if args.steps.is_empty()
        || args.steps.len() > 12
        || args.steps.iter().any(|step| {
            step.title.trim().is_empty()
                || step.title.chars().count() > 160
                || !matches!(
                    step.status.as_str(),
                    "pending" | "in-progress" | "completed"
                )
        })
        || args
            .steps
            .iter()
            .filter(|step| step.status == "in-progress")
            .count()
            > 1
        || args.explanation.chars().count() > 1_024
        || (args.blocked && args.explanation.trim().is_empty())
    {
        return Err(ai_error(
            "AI_TOOL_CALL_INVALID",
            "任务计划需包含 1–12 个短步骤，最多一个正在进行；暂停时需说明原因",
        ));
    }
    Ok(args)
}

fn unfinished_task_steps(steps: &[AiTaskStep]) -> bool {
    steps.iter().any(|step| step.status != "completed")
}

fn finalize_task_state(task: &mut AiTaskState) {
    if task.status == "interrupted" {
        return;
    }
    if unfinished_task_steps(&task.steps) {
        task.status = "interrupted".into();
        task.reason = Some("仍有未完成步骤，可继续任务；尚未确认整体完成。".into());
    } else {
        task.status = "completed".into();
        task.reason = None;
    }
}

fn execute_task_plan(
    call: &ProviderToolCall,
    channel: &Channel<AiStreamEvent>,
    steps: &mut Vec<AiTaskStep>,
) -> Result<(ToolLoopResult, AiToolCallResult), AppError> {
    let args = match parse_task_plan(&call.arguments) {
        Ok(args) => args,
        Err(error) => {
            return Ok(copilot_tool_result(
                &call.id,
                "invalid",
                Some(error.to_string()),
            ))
        }
    };
    *steps = args.steps.clone();
    emit_stream_event(
        channel,
        AiStreamEvent::TaskProgress {
            steps: args.steps,
            explanation: args.explanation.clone(),
            blocked: args.blocked,
        },
    )?;
    Ok(copilot_tool_result(
        &call.id,
        if args.blocked {
            "input-required"
        } else {
            "executed"
        },
        Some(if args.blocked {
            args.explanation
        } else {
            "Plan recorded. Continue unfinished steps using the approved tools; a plan update is not execution or verification evidence.".into()
        }),
    ))
}
