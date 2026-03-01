# Durable Execution [link](https://docs.langchain.com/oss/javascript/langgraph/durable-execution#original)

### คืออะไร
คือ ความสามารถในการ จดจำสถานะ (Persistance) ทุก step ที่ AI ทำงาน เมื่อเกิดข้อผิดพลาด หรือ ต้องหยุดรอการตัดสินใจจากมนุษย์ ระบบจะไม่เริ่มนับ 1 ใหม่ แต่จะ Resume จากจุดล่าสุดที่บันทึกไว้ (Checkpointer) ได้ทันที แม้จะผ่านไปเป็นสัปดาห์ หรือ server จะล่มไประหว่างทาง

### ใช้เพื่ออะไร
1. ป้องกันงานซ้ำซ้อน จะไม่เสีย token หรือ เวลา process ใหม่ ในขั้นตอนที่สำเร็จไปแล้ว
2. รองรับ Human-in-the-loop หยุดรอให้มนุษย์มาตรวจก่อนส่งไป thread ต่อไป
3. เพิ่มความเสถียร (Fault Tolerance) ถ้าหาก API ภายนอกล่ม หรือว่าไม่สามารถต่อ internet ได้ ระบบจะกลับมาทำงานจากจุดเดิม เมื่อพร้อมม

### ใช้เมื่อไหร่
1. งานที่ใช้เวลานาน (Long-running Tasks): เช่น การสแกนข่าวหุ้นย้อนหลัง 10 ปี หรือการอ่านงบการเงินหลายร้อยหน้า
2. งานที่ต้องมีการอนุมัติ: เมื่อ Agent วิเคราะห์เสร็จแล้วต้องรอคนยืนยัน "Buy/Sell"
3. งานที่มีความเสี่ยงสูง: งานที่เรียกใช้ API ที่มีค่าใช้จ่ายแพงหรือมีโอกาส Timeout สูง เพื่อไม่ให้ต้องจ่ายเงินซ้ำสำหรับงานเดิม

### Example Code

```ts
import { StateGraph, StateSchema, type GraphNode, START, END, MemorySaver, task } from "@langchain/langgraph";
import { v4 as uuidv4 } from "uuid";
import * as z from "zod";

// Define a StateSchema to represent the state
const State = new StateSchema({
    url: z.string(),
    result: z.string().optional(),
});

const makeRequest = task("makeRequest", async (url: string) => {
    console.log(2);

    const response = await fetch(url);
    const text = await response.text();
    return text;
});

const textSlice = task("textSlice", async (text: string) => {
    console.log(3);
    throw new Error("Simulated Failure!"); // แกล้งให้พังตรงนี้ เพื่อทดสอบการ Resume
    return text.slice(0, 100);
});

// GraphNode เป็น type ที่รับ generic มาเป็น StateSchema ของกราฟ ทำให้ตอนเรียกใช้งานสามารถระบุ StateSchema ของกราฟได้
const callApi: GraphNode<typeof State> = async (state) => {
    console.log(1);

    const response = await makeRequest(state.url);
    return {
        result: await textSlice(response),
    };
};

// Create a StateGraph builder and add a node for the callApi function
const builder = new StateGraph(State)
    .addNode("callApi", callApi)
    .addEdge(START, "callApi") // เมื่อเริ่มกราฟ จะไปที่ node "callApi"
    .addEdge("callApi", END); // เมื่อ node "callApi" สำเร็จ จะไปที่ node "END"

// Specify a checkpointer
const checkpointer = new MemorySaver();

// Compile the graph with the checkpointer
const graph = builder.compile({ checkpointer });

// Define a config with a thread ID.

// const threadId = uuidv4();
const threadId = "1234567890";
const config = { configurable: { thread_id: threadId } };

// Invoke the graph
try {

    await graph.invoke({ url: "https://pokeapi.co/api/v2/pokemon" }, config);
} catch (error) {
    console.error("first run failed (expected):", error);
    console.log("snapshot after fail:", await graph.getState(config));
}

const out = await graph.invoke(null as any, config);

console.log("output:", out);
```

<i>การอธิบาย: เมื่อระบบทำงานผ่าน fetchStockData ไปแล้ว ผลลัพธ์จะถูกเซฟไว้ใน checkpointer ทันที หากบรรทัดถัดไป Error และเราสั่งรันใหม่อีกครั้งโดยใช้ thread_id เดิม ระบบจะดึงค่าจาก Memory มาเลยโดย ไม่เรียก Fetch ซ้ำ</i>

จาก code ด้านบน จะเห็นว่า เรามีการครอบ try catch ไว้ เพื่อจำลองการทำงานต่อเนื่อง (เพราะถ้าปล่อยให้ program จบการทำงาน RAM session ที่เก็บไว้นั้น จะหายไปด้วย มันเก็บเป็น by session)

จากนั้น เราให้ invoke null เข้าไปอีก เพื่อจำลองการทำงานแบบ resume

จะเห็นว่า การทำงานของ program จำทำงานแบบนี้

1

2

3 -> จะได้ error จากการที่เราจำลองไป

และ

1 -> ที่ยังกลับมา 1 เพราะเรากำหนดให้ 1 เป็น process เริ่มต้น

3 -> ตกมาที่ 3 เลย เพราะ 2 ผ่านแล้ว

### Q&A

1. Q: ระบบ Resume จาก "บรรทัด" ที่ค้างไว้เลยใช่ไหม?
A: ไม่ใช่ครับ ระบบจะ Resume จาก "จุดเริ่มต้นของ Node" หรือ Task ล่าสุดที่ทำค้างไว้ ดังนั้น Code ใน Node ต้องรองรับการรันซ้ำได้ (Idempotent)

2. Q: MemorySaver ใช้บน Production ได้ไหม?
A: ไม่แนะนำครับ เพราะมันเก็บใน RAM ถ้า Restart เครื่องข้อมูลจะหาย ควรใช้ PostgresSaver หรือ Redis แทน

3. Q: ทำไมต้องใช้ task() หุ้ม API call?
A: เพื่อให้ LangGraph บันทึกผลลัพธ์ของ API นั้นไว้ ถ้าไม่หุ้ม เมื่อมีการ Replay ระบบจะยิง API เดิมซ้ำอีกรอบ

4. Q: ถ้าผมไม่ใส่ thread_id จะเกิดอะไรขึ้น?
A: ระบบจะถือว่าเป็นงานใหม่เสมอ และจะไม่มีการบันทึกสถานะเพื่อ Resume ครับ

5. Q: "Idempotent" ที่บทความเน้นคืออะไร?
A: คือการเขียน Code ให้รันกี่ครั้งผลลัพธ์ก็เหมือนเดิม เช่น การเขียนไฟล์ทับที่เดิม แทนที่จะเป็นการเขียนต่อท้ายไฟล์ (Append) ไปเรื่อยๆ

6. Q: ความแตกต่างระหว่าง durability: "sync" กับ "async"?
A: sync จะรอมันเขียน DB เสร็จก่อนถึงไป Step ถัดไป (ช้าแต่ชัวร์) ส่วน async จะทำงานต่อเลยขณะที่กำลังเขียน DB (เร็วแต่เสี่ยงข้อมูลหายถ้าเครื่องดับทันที)

7. Q: เราสามารถแก้ไข State ระหว่างที่มัน Pause ได้ไหม?
A: ได้ครับ นี่คือจุดเด่นของ Human-in-the-loop เราสามารถแทรกแซงและแก้ไขค่าใน State ก่อนสั่งให้มันทำงานต่อได้

8. Q: ถ้า Workflow ค้างมาเป็นเดือน ข้อมูลจะยังอยู่ไหม?
A: อยู่ตราบเท่าที่ฐานข้อมูล (Checkpointer) ของคุณยังไม่ลบข้อมูลนั้นทิ้งครับ

9. Q: การใช้ Durable Execution ทำให้ระบบช้าลงไหม?
A: มี Overhead เล็กน้อยจากการเขียนข้อมูลลง Database ในทุกๆ Step แต่แลกมาด้วยความปลอดภัยของข้อมูล

10. Q: ใช้กับ Functional API ได้ไหม หรือต้องใช้ StateGraph อย่างเดียว?
A: ใช้ได้ทั้งคู่ครับ หลักการเดียวกันคือการหุ้ม logic ไว้ใน entrypoint หรือ task

### Note

การทำงาน บน production จริงๆ จะไม่ใช้ `MemorySaver` แต่จะให้ persistent checkpointer เช่น postgres/Redis แล้ว resume ด้วย thread_id เดิม หลังจากระบบ recovery

#### การ design DB

เมื่อใช้ PostgresSaver ของ LangGraph ระบบจะสร้าง Table ให้ auto/ หรือถ้าอยากจะ design table เองก้ได้

#### การทำงานจริง

ปกติแล้ว การ design ระบบ เรามักจะ design ระบบให้ทำงานผ่าน Message Queue ไม่ว่าจะเป็น Google PUB/SUB, Azure SB, RabbitMQ

เราจะสร้าง instant ของ checkpointer (pg/redis) เอาไว้

สร้าง function ที่รอรับ request (thread_id, input) และใน function ต้องมีการต่อ checkpointer เข้ากับ pipeline ด้วย

ส่วนการ `Resume` เราจะอาศัย Behavior ของ Message Queue

ขั้นตอนทำงานประมาณนี้

1. หากเป็นการ ทำงานใหม่ (ไม่ใช่ case resend) ก็จะเป็นการทำงานตามปกติ คือ server ทำการ push ขึ้น message queue ที่ประกอบไปด้วย input และ thread_id

2. ด้วย behavior ของ message queue อาจจะเป็น Azure Service Bus มันก็จะมีการ re fetch message อยู่แล้ว หากยังมี message ค้างอยู่ ขึ้นอยู่กับ TTL

3. ไม่ว่าจะเกิดเหตุการณ์ 1 หรือ 2 ระบบจะต้องนำ thread_id นั้นมาเพื่อ track การทำงาน แต่ ด้วยการที่เรามี checkpointer ก็จะทำให้มีการตัดสินใจโดยอัตโนมัติ ของ langGraph ว่าจะทำงานใหม่ ทุกขั้นตอนเลย หรือว่า จะทำงานเฉพาะที่ค้างอยู่ ขึ้นอยู่กับ thread_id ที่ถูกบันทึกไว้ใน checkpointer

4. หากต้องการจะ handle เพิ่ม อาจจะทำหน้า UI ขึ้นมาให้กด resend thread_id ที่ไม่สำเร็จได้ด้วย

5. [prd_code](./prd.ts)