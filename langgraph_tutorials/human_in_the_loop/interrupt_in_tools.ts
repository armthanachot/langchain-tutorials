import { tool } from "@langchain/core/tools";
import { ChatOpenAI } from "@langchain/openai";
import {
    Command,
    MemorySaver,
    START,
    END,
    StateGraph,
    StateSchema,
    MessagesValue,
    interrupt,
} from "@langchain/langgraph";
import * as z from "zod";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ToolNode, toolsCondition } from "@langchain/langgraph/prebuilt";

const model = new ChatOpenAI({ model: "gpt-4o-mini" })

const sendEmailTool = tool(
    async ({ to, subject, body }) => {
        console.log("__call sendEmailTool__");

        console.log("to: ", to);
        console.log("subject: ", subject);
        console.log("body: ", body);
        
        // Pause before sending; payload surfaces in result.__interrupt__
        const response = interrupt({
            action: "send_email",
            to,
            subject,
            body,
            message: "Approve sending this email?",
        });

        if (response?.action === "approve") {
            const finalTo = response.to ?? to;
            const finalSubject = response.subject ?? subject;
            const finalBody = response.body ?? body;
            // console.log("[sendEmailTool]", finalTo, finalSubject, finalBody);
            return `Email sent to ${finalTo}`;
        }
        return "Email cancelled by user";
    },
    {
        name: "send_email",
        description: "Send an email to a recipient",
        schema: z.object({
            to: z.string(),
            subject: z.string(),
            body: z.string(),
        }),
    },
);

const contentWriterTool = tool(async ({ name }) => {
    console.log("__call contentWriter tool__");

    const content = await model.invoke([
        new SystemMessage(`คุณเป็นนักเขียน และ creative writer ที่สามารถเขียนออกมาได้อย่างสร้างสรรค์ อบอุ่น เป็นกันเอง ใช้น้ำเสียงเหมือนพี่บอกน้อง`),
        new HumanMessage(`เขียน email content แสดงความยินดีกับผู้ใช้งาน ชื่อ ${name} ที่ได้ผ่านการทดลองงาน ไม่เกิน 50 คำ`),
    ])

    console.log("---- content ----");
    console.log(content.content);
    
    return content.content;
}, {
    name: "write_content",
    description: "Write content to a file",
    schema: z.object({
        name: z.string(),
    }),
})

const tools = [contentWriterTool, sendEmailTool];
const modelWithTools = model.bindTools(tools);
const toolNode = new ToolNode(tools);

const State = new StateSchema({
    messages: MessagesValue,
});


const agent: typeof State.Node = async (state) => {
    // LLM may decide to call the tool; interrupt pauses before sending
    const response = await modelWithTools.invoke(state.messages);
    return { messages: [response] };
};

const graphBuilder = new StateGraph(State)
    .addNode("agent", agent)
    .addNode("tools", toolNode)
    .addEdge(START, "agent")
    .addConditionalEdges("agent", toolsCondition, {
        tools: "tools",
        "__end__": END,
    })
    .addEdge("tools", "agent");

const checkpointer = new MemorySaver();
const graph = graphBuilder.compile({ checkpointer });

const config = { configurable: { thread_id: "email-workflow" } };
const initial = await graph.invoke(
    {
        messages: [
            {
                role:"human",
                content:"1. call contentWriterTool เพื่อทำการเขียน content ของ email สำหรับผู้ใช้งาน ชื่อ John Doe ที่ได้ผ่านการทดลองงาน, 2. call sendEmailTool เพื่อส่ง email ไปที่ john.doe@example.com เพื่อบอกว่าได้ผ่านการทดลองงาน"
            }
        ],
    },
    config,
);
// console.log(initial); // -> [{ value: { action: 'send_email', ... } }]

// Resume with approval and optionally edited arguments
const resumed = await graph.invoke(
    new Command({
        resume: { action: "approve", subject: "Updated subject" },
    }),
    config,
);
console.log(resumed.messages.at(-1)); // -> Tool result returned by send_email