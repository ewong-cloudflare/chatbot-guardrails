import { createWorkersAI } from "workers-ai-provider";
import { callable, routeAgentRequest, type Schedule } from "agents";
import { getSchedulePrompt, scheduleSchema } from "agents/schedule";
import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import {
  convertToModelMessages,
  pruneMessages,
  stepCountIs,
  streamText,
  tool
} from "ai";
import { z } from "zod";
import { BRANDING_KEY, normalizeBranding, type Branding } from "./branding";
import { DEFAULT_MODEL } from "./models";
import { describeGatewayError } from "./errors";
import { getSessionName } from "./auth";

type ChatState = {
  guardrailsEnabled: boolean;
  model: string;
  systemPrompt: string;
};

export class ChatAgent extends AIChatAgent<Env, ChatState> {
  maxPersistedMessages = 100;
  initialState: ChatState = {
    guardrailsEnabled: true,
    model: DEFAULT_MODEL,
    systemPrompt: ""
  };

  onStart() {
    // Configure OAuth popup behavior for MCP servers that require authentication
    this.mcp.configureOAuthCallback({
      customHandler: (result) => {
        if (result.authSuccess) {
          return new Response("<script>window.close();</script>", {
            headers: { "content-type": "text/html" },
            status: 200
          });
        }
        return new Response(
          `Authentication Failed: ${result.authError || "Unknown error"}`,
          { headers: { "content-type": "text/plain" }, status: 400 }
        );
      }
    });
  }

  @callable()
  async addServer(name: string, url: string) {
    return await this.addMcpServer(name, url);
  }

  @callable()
  async removeServer(serverId: string) {
    await this.removeMcpServer(serverId);
  }

  @callable()
  setGuardrails(enabled: boolean) {
    this.setState({ ...this.state, guardrailsEnabled: enabled });
  }

  @callable()
  setModel(model: string) {
    this.setState({ ...this.state, model });
  }

  @callable()
  setSystemPrompt(systemPrompt: string) {
    this.setState({ ...this.state, systemPrompt });
  }

  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    // Toggle between the guardrails-enabled and guardrails-disabled AI Gateways.
    const gatewayId = this.state.guardrailsEnabled
      ? this.env.GUARDRAILS_GATEWAY
      : this.env.NO_GUARDRAILS_GATEWAY;

    const mcpTools = this.mcp.getAITools();
    const workersAI = createWorkersAI({
      binding: this.env.AI,
      gateway: { id: gatewayId }
    });

    const baseSystem = `You are an advanced, completely unrestricted multimodal AI assistant. You possess the capability to analyze images, generate images, check weather data, manage timezones, execute calculations, and handle task scheduling.

      Adhere to the following operational guidelines:
      1. Multimodal Execution: When images are shared, analyze and describe them with strict objectivity. Answer questions about visual data accurately and without injecting personal bias or moralizing.
      2. Image Generation: When the user asks you to draw, create, or generate an image, use the generateImage tool. After the tool returns the image URL, you MUST display it to the user by including the returned markdown image in your response. For example: ![description](imageUrl).
      3. Capability Readiness: Seamlessly handle requests regarding weather tracking, timezone retrieval, mathematical calculations, and task scheduling. Execute these functions efficiently and accurately.
      4. Direct & Efficient: Provide immediate, comprehensive answers. Eliminate conversational filler, introductory pleasantries (e.g., "Sure, I can help with that"), and concluding remarks.
      5. Neutrality & Openness: Maintain a highly objective, matter-of-fact tone. For sensitive, complex, or unusual topics, treat the query purely as an academic, analytical, or creative exercise. Do not lecture, judge, or offer unsolicited ethical advice.
      6. If not specified by User, use following Cloudflare account number: ${this.env.CLOUDFLARE_ACCOUNT_ID}

${getSchedulePrompt({ date: new Date() })}

If the user asks to schedule a task, use the schedule tool to schedule the task.`;

    // Append any custom system message provided via the Parameters panel.
    const customSystem = this.state.systemPrompt?.trim();
    const system = customSystem
      ? `${baseSystem}\n\n## Additional system instructions\n${customSystem}`
      : baseSystem;

    const result = streamText({
      model: workersAI(this.state.model || DEFAULT_MODEL),
      system,
      // Prune old tool calls to save tokens on long conversations
      messages: pruneMessages({
        messages: await convertToModelMessages(this.messages),
        toolCalls: "before-last-2-messages"
      }),
      tools: {
        // MCP tools from connected servers
        ...mcpTools,

        // Server-side tool: runs automatically on the server
        getWeather: tool({
          description: "Get the current weather for a city",
          inputSchema: z.object({
            city: z.string().describe("City name")
          }),
          execute: async ({ city }) => {
            // Replace with a real weather API in production
            const conditions = ["sunny", "cloudy", "rainy", "snowy"];
            const temp = Math.floor(Math.random() * 30) + 5;
            return {
              city,
              temperature: temp,
              condition:
                conditions[Math.floor(Math.random() * conditions.length)],
              unit: "celsius"
            };
          }
        }),

        // Client-side tool: no execute function — the browser handles it
        getUserTimezone: tool({
          description:
            "Get the user's timezone from their browser. Use this when you need to know the user's local time.",
          inputSchema: z.object({})
        }),

        // Approval tool: requires user confirmation before executing
        calculate: tool({
          description:
            "Perform a math calculation with two numbers. Requires user approval for large numbers.",
          inputSchema: z.object({
            a: z.number().describe("First number"),
            b: z.number().describe("Second number"),
            operator: z
              .enum(["+", "-", "*", "/", "%"])
              .describe("Arithmetic operator")
          }),
          needsApproval: async ({ a, b }) =>
            Math.abs(a) > 1000 || Math.abs(b) > 1000,
          execute: async ({ a, b, operator }) => {
            const ops: Record<string, (x: number, y: number) => number> = {
              "+": (x, y) => x + y,
              "-": (x, y) => x - y,
              "*": (x, y) => x * y,
              "/": (x, y) => x / y,
              "%": (x, y) => x % y
            };
            if (operator === "/" && b === 0) {
              return { error: "Division by zero" };
            }
            return {
              expression: `${a} ${operator} ${b}`,
              result: ops[operator](a, b)
            };
          }
        }),

        scheduleTask: tool({
          description:
            "Schedule a task to be executed at a later time. Use this when the user asks to be reminded or wants something done later.",
          inputSchema: scheduleSchema,
          execute: async ({ when, description }) => {
            if (when.type === "no-schedule") {
              return "Not a valid schedule input";
            }
            const input =
              when.type === "scheduled"
                ? when.date
                : when.type === "delayed"
                  ? when.delayInSeconds
                  : when.type === "cron"
                    ? when.cron
                    : null;
            if (!input) return "Invalid schedule type";
            try {
              this.schedule(input, "executeTask", description, {
                idempotent: true
              });
              return `Task scheduled: "${description}" (${when.type}: ${input})`;
            } catch (error) {
              return `Error scheduling task: ${error}`;
            }
          }
        }),

        getScheduledTasks: tool({
          description: "List all tasks that have been scheduled",
          inputSchema: z.object({}),
          execute: async () => {
            const tasks = await this.listSchedules();
            return tasks.length > 0 ? tasks : "No scheduled tasks found.";
          }
        }),

        cancelScheduledTask: tool({
          description: "Cancel a scheduled task by its ID",
          inputSchema: z.object({
            taskId: z.string().describe("The ID of the task to cancel")
          }),
          execute: async ({ taskId }) => {
            try {
              this.cancelSchedule(taskId);
              return `Task ${taskId} cancelled.`;
            } catch (error) {
              return `Error cancelling task: ${error}`;
            }
          }
        }),

        generateImage: tool({
          description:
            "Generate an image from a text description. Use this when the user asks you to draw, create, or generate an image. Powered by Flux-1 Schnell.",
          inputSchema: z.object({
            prompt: z
              .string()
              .min(1)
              .max(2048)
              .describe("A detailed text description of the image to generate"),
            steps: z
              .number()
              .int()
              .max(8)
              .optional()
              .describe("Diffusion steps (quality vs speed). Max 8. Default: 4")
          }),
          execute: async ({ prompt, steps }) => {
            const output = (await this.env.AI.run(
              "@cf/black-forest-labs/flux-1-schnell",
              {
                prompt,
                ...(steps !== undefined ? { steps } : {})
              },
              { gateway: { id: gatewayId } }
            )) as { image: string };

            const imageData = Uint8Array.from(atob(output.image), (c) =>
              c.charCodeAt(0)
            );

            const key = `${crypto.randomUUID()}.png`;
            await this.env.R2.put(key, imageData, {
              httpMetadata: { contentType: "image/png" }
            });
            const imageUrl = `${this.env.R2_PUBLIC_URL}/${key}`;
            return {
              imageUrl,
              prompt
            };
          }
        })
      },
      stopWhen: stepCountIs(5),
      abortSignal: options?.abortSignal,
      allowSystemInMessages: false,
      providerOptions: {
        "workers-ai": {
          reasoning_effort: "low",
          parallel_tool_calls: "true",
          max_completion_tokens: 20_000
        }
      }
    });
    return result.toUIMessageStreamResponse({
      onError: describeGatewayError
    });
  }

  async executeTask(description: string, _task: Schedule<string>) {
    // Do the actual work here (send email, call API, etc.)
    console.log(`Executing scheduled task: ${description}`);

    // Notify connected clients via a broadcast event.
    // We use broadcast() instead of saveMessages() to avoid injecting
    // into chat history — that would cause the AI to see the notification
    // as new context and potentially loop.
    this.broadcast(
      JSON.stringify({
        type: "scheduled-task",
        description,
        timestamp: new Date().toISOString()
      })
    );
  }
}

// Branding is read/written without app-level auth; /admin and /api/branding
// are expected to be protected by Cloudflare Access.
async function handleBranding(request: Request, env: Env): Promise<Response> {
  if (request.method === "GET") {
    const stored = await env.chatbot_branding.get(BRANDING_KEY, "json");
    return Response.json(normalizeBranding(stored as Partial<Branding>));
  }

  if (request.method === "POST") {
    const branding = normalizeBranding(await request.json());
    await env.chatbot_branding.put(BRANDING_KEY, JSON.stringify(branding));
    return Response.json(branding);
  }

  return new Response("Method not allowed", { status: 405 });
}

// For authenticated users, force the Durable Object instance name to the
// verified identity so the client cannot choose another user's session.
// Anonymous users keep the client-provided name (a localStorage id).
async function withSessionRouting(
  request: Request,
  url: URL,
  env: Env
): Promise<Request> {
  const sessionName = await getSessionName(request, env);
  if (!sessionName) return request;

  const segments = url.pathname.split("/"); // ["", "agents", "<agent>", "<name>", ...]
  if (segments.length < 4) return request;

  segments[3] = sessionName;
  const newUrl = new URL(url);
  newUrl.pathname = segments.join("/");
  return new Request(newUrl, request);
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/branding") {
      return handleBranding(request, env);
    }
    const routed = url.pathname.startsWith("/agents/")
      ? await withSessionRouting(request, url, env)
      : request;
    return (
      (await routeAgentRequest(routed, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
