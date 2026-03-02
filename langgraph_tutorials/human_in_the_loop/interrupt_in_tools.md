# Interrupt in Tools [link](https://docs.langchain.com/oss/javascript/langgraph/interrupts#interrupts-in-tools)

1. อธิบายง่ายๆก็คือการที่เราสามารถทำการ interrupt ในขณะที่มีการเรียก tools ได้
2. ใช้ interrupt กับ Command({resume: {...}})
3. ของจริงใช้ checkpointer เป็น DB ตาม [checkpointer](./prd/checkpointer.ts)

สำหรับตัวอย่างใน [interrupt_in_rools.ts](./interrupt_in_tools.ts)

จุดที่สำตัญๆ มีดังนี้

1. tool - เราจะใช้ tool ในการสร้าง tool function ข้อที่ต้อง note ไว้เลย คือ
```ts
import { tool } from "@langchain/core/tools";

const contentWriterTool = tool(async ({ name }) => { //name ตรงนี้
    console.log("__call contentWriter tool__");

    const content = await model.invoke([
        new SystemMessage(`คุณเป็นนักเขียน และ creative writer ที่สามารถเขียนออกมาได้อย่างสร้างสรรค์ อบอุ่น เป็นกันเอง ใช้น้ำเสียงเหมือนพี่บอกน้อง`), //เปรียบเสมือน instruction
        new HumanMessage(`เขียน email content แสดงความยินดีกับผู้ใช้งาน ชื่อ ${name} ที่ได้ผ่านการทดลองงาน ไม่เกิน 50 คำ`), //prompt ของคน
    ])

    console.log("---- content ----");
    console.log(content.content);
    
    return content.content;
}, {
    name: "write_content",
    description: "Write content to a file",
    schema: z.object({
        name: z.string(), // ต้องตรงกับ schema ของ tool ที่กำหนด
    }),
})
```

2. ToolNode
```ts
import { ToolNode } from "@langchain/langgraph/prebuilt";

const tools = [contentWriterTool, sendEmailTool];
const modelWithTools = model.bindTools(tools);
const toolNode = new ToolNode(tools); //เพื่อใช้สร้าง node สำหรับ tool ที่จะนำไป register ให้ pipeline รู้จัก
```

3. setup pipeline
```ts
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

import { toolsCondition } from "@langchain/langgraph/prebuilt";


const graphBuilder = new StateGraph(State)
    .addNode("agent", agent)
    .addNode("tools", toolNode) //add toolNode
    .addEdge(START, "agent")
    .addConditionalEdges("agent", toolsCondition, {
        tools: "tools",
        "__end__": END,
    }) //เป็นการ observe ว่า node agent มี condition ตรงตาม toolsCondition ที่เป็นแบบสำเร็จรูปมั้ย ถ้ามี มันจะส่งต่อไปที่ tools node ถ้าไม่ใช่ ก็จะส่งไปหา end
    .addEdge("tools", "agent"); //มีตัวคุม end แล้ว ไม่ต้องคุมเอง

const checkpointer = new MemorySaver(); // ของจริง เปลี่ยนเป็น DB
const graph = graphBuilder.compile({ checkpointer });

const config = { configurable: { thread_id: "email-workflow" } };
const initial = await graph.invoke(
    {
        messages: [
            {
                role:"human",
                content:"1. call contentWriterTool เพื่อทำการเขียน content ของ email สำหรับผู้ใช้งาน ชื่อ John Doe ที่ได้ผ่านการทดลองงาน, 2. call sendEmailTool เพื่อส่ง email ไปที่ john.doe@example.com เพื่อบอกว่าได้ผ่านการทดลองงาน"
            } //ไม่รู้ว่าระบุแบบละเอียดเกินรึเปล่า
        ],
    },
    config,
);

```
4. resume
```ts
const resumed = await graph.invoke(
    new Command({
        resume: { action: "approve", subject: "Updated subject" },
    }), //คืน object ไปให้ยังจุดที่ interrupt
    config,
);
```


# addCondition เสริม

จริงๆ addCondition ถือว่ามีประโยชน์มากในงานที่จะ check condition ที่ออกจาก node ก่อนหน้า เช่น

```ts
// ฟังก์ชันตัดสินใจ (Router Function)
const routeAfterChecking = (state: typeof State.State) => { //control โดยใช้ state
    const lastMessage = state.messages[state.messages.length - 1];
    
    // ถ้าในคำตอบมีคำว่า "REJECT" ให้ส่งกลับไปแก้ไข
    if (lastMessage.content.includes("REJECT")) {
        return "editor_node";
    }
    // ถ้าผ่าน ให้จบงาน
    return "end";
};

const graphBuilder = new StateGraph(State)
  .addNode("writer", writerNode)
  .addNode("editor", editorNode)
  .addEdge(START, "writer")
  .addConditionalEdges(
    "writer",           // เริ่มเช็คหลังจากจบ node writer
    routeAfterChecking, // ใช้ฟังก์ชันที่เราเขียนเองในการตัดสินใจ
    {
      editor_node: "editor", // ถ้าฟังก์ชันคืนค่า 'editor_node' ให้ไปหา node editor
      end: END               // ถ้าคืนค่า 'end' ให้จบงาน
    }
  );
```