# Human in the loop (Interupts) [link](https://docs.langchain.com/oss/javascript/langgraph/interrupts)

### คืออะไร
มันคือ กลไกการ `หยุดชั่วคราว` ของ Graph อย่างตั้งใจ เพื่อรอการ approve จากภายนอก (Human-in-the-loop) โดยระบบจะ save state ทั้งหมดลงใน Persistance layer และหยุดรอ จนกว่า จะได้รับคำส่ง
`Command({resume: ...})` ส่งกลับเข้ามา เพื่อปลุกให้ Agent ทำงานต่อจากจุดเดิม

### ใช้เพื่ออะไร
1. Human-in-the-loop: เพื่อให้มนุษย์ เข้ามาตรวจสอบ (Review), แก้ไข (Edit), อนุมัติ (Approve) ก่อนที่จะไปต่อยังขั้นตอนที่สำคัญ
2. ความปลอดภัย: ป้องกัน AI ตัดสินใจผิดพลาด ในเรื่องที่มีความเสี่ยงสูง เช่น การโอนเงิน/การส่ง email หาลูกค้า่
3. ความยืดหยุ่น: ช่วยให้สามารถ แทรกแทรงลำดับการทำงานได้

### ใช้เมื่ิอไหร่
1. งานที่ต้องการการอนุมัติ: เช่น "คุณยืนยันที่จะขายหุ้นตัวนี้ที่ราคา $150 หรือไม่?"
2. งานที่ต้องการข้อมูลเพิ่มเติมจากมนุษย์: เช่น เมื่อ AI หาข้อมูลไม่พบแล้วต้องหยุดถาม User ว่า "ช่วยระบุชื่อบริษัทให้ชัดเจนอีกครั้งได้ไหม?"
3. การ Debug: ใช้ร่วมกับ interruptBefore หรือ interruptAfter เพื่อหยุดดูสถานะของ State ในแต่ละ Node (Breakpoint)

### ตัวอย่าง code

```ts
import { interrupt, Command, StateGraph, START, END, MemorySaver } from "@langchain/langgraph";

// 1. สร้าง Node ที่มีการหยุดรอ
const approvalNode = async (state: any) => {
    // ระบบจะหยุดที่บรรทัดนี้ และคืนค่า "Transfer $500?" ออกไปที่ Caller
    const isApproved = interrupt(`Do you approve: ${state.action}?`);

    // เมื่อมีการ Resume ค่าที่ส่งมาจะถูกเก็บในตัวแปร isApproved
    if (isApproved === true) {
        return { status: "Done" };
    }
    return { status: "Cancelled" };
};

// 2. การเรียกใช้งานครั้งแรก (จะติด Interrupt)
const config = { configurable: { thread_id: "tx-123" } };
const result = await graph.invoke({ action: "Transfer $500" }, config);

// ตรวจสอบค่าที่ส่งมาจาก interrupt
console.log(result.__interrupt__[0].value); // -> "Do you approve: Transfer $500?"

// 3. การ Resume (ส่งคำสั่งอนุมัติกลับไป)
await graph.invoke(new Command({ resume: true }), config);
```

คำอธิบาย: เมื่อ interrupt() ถูกเรียก ระบบจะ "โยน Error พิเศษ" ขึ้นไปเพื่อให้ Graph หยุดและเซฟสถานะ เมื่อเราสั่ง invoke อีกครั้งพร้อม Command({ resume: true }) โค้ดใน Node จะถูกรันใหม่ตั้งแต่ต้น แต่คราวนี้ interrupt() จะไม่หยุดทำงาน แต่จะคืนค่า true ออกมาให้เราทันที

#### Q&A
1. Q: เมื่อ Resume แล้ว โค้ดจะเริ่มรันจากบรรทัดไหน?
A: เริ่มรันจาก "ต้น Node" นั้นใหม่ครับ ไม่ใช่รันต่อจากบรรทัดที่เรียก interrupt ดังนั้นโค้ดก่อนหน้า interrupt ต้องเป็น Idempotent (รันซ้ำได้ผลเดิม)

2. Q: ทำไมห้ามใช้ try/catch หุ้ม interrupt()?
A: เพราะ interrupt ใช้วิธีการ Throw Exception เพื่อหยุดการทำงาน ถ้าคุณ Catch มันไว้ Graph จะไม่หยุดทำงานและเสียสถานะไป

3. Q: __interrupt__ คืออะไร?
A: คือ Field พิเศษที่ LangGraph ใส่มาให้ในผลลัพธ์ เพื่อบอกว่าขณะนี้ Graph กำลังรอคำตอบสำหรับคำถามอะไรบ้าง

4. Q: ถ้ามีหลาย Node ทำงานขนานกันแล้วติด interrupt พร้อมกันล่ะ?
A: LangGraph จะรวบรวม Payload ของทุกตัวไว้ใน Array ของ __interrupt__ และคุณสามารถใช้ resumeMap เพื่อตอบคำตอบกลับไปพร้อมกันได้

5. Q: เราสามารถส่งข้อมูลซับซ้อนไปใน interrupt() ได้ไหม?
A: ได้ครับ แต่ต้องเป็น JSON-serializable (ห้ามส่ง Class instance หรือ Function)

6. Q: ต่างจาก Breakpoint ทั่วไปอย่างไร?
A: Breakpoint (Static) จะหยุดก่อนหรือหลัง Node เสมอ แต่ interrupt (Dynamic) สามารถวางไว้ตรงไหนก็ได้ใน Logic ของคุณ

7. Q: ถ้า User ไม่ตอบกลับมาเลยจะเกิดอะไรขึ้น?
A: ระบบจะรออยู่ในฐานข้อมูล (Checkpointer) ตลอดไปครับ จนกว่าคุณจะสั่ง Resume หรือลบ Thread นั้นทิ้ง

8. Q: สามารถใช้ interrupt ใน Tool ได้ไหม?
A: ได้ครับ และเป็นวิธีที่ดีมากในการขออนุมัติก่อน Tool จะทำงานจริง (เช่น Tool ส่งเมล)

9. Q: การใช้ interrupt ทำให้เปลือง Token ไหม?
A: ถ้าใน Node นั้นมีการเรียก LLM ก่อนถึงบรรทัด interrupt เมื่อ Resume มันจะเรียก LLM ซ้ำ (ยกเว้นคุณจะหุ้ม LLM ไว้ใน task เพื่อทำ Durable Execution)

10. Q: thread_id จำเป็นแค่ไหนสำหรับ Interrupt?
A: จำเป็นที่สุดครับ เพราะมันคือ "กุญแจ" ที่ใช้ไขไปหาตู้เซฟที่เก็บสถานะที่หยุดค้างไว้ ถ้าไม่มี thread_id คุณจะไม่สามารถ Resume งานเดิมได้เลย

# Common Pattern
1. Approval workflows คือการหยุดชั่วคราวก่อนกระทำสิ่งสำคัญ แล้วขอ approve จากคนก่อน อาจจะต้องให้คนอนุมัติ เช่น การเรียกใช้ API, การ update data ใน db, ...
2. Handling multiple interrupts คือ เมื่อมีการเรียกใช้ Interupts พร้อมกันจากหลายๆ node, และอาจต้อง resume ให้กับหลาย interupt ทำได้โดยการเรียกใช้งาน function ครั้งเดียว ให้จับคู่ interupt ID กับค่า resume ของมันเอง วิธีนี้จะทำให้ resume ถูกต้อง
3. Review and edit คือ มนุษย์สามารถตรวจสอบและแก้ไขข้อมูลก่อนส่งต่อได้
4. Interupting tool calls คือ สามารถ interupt การ call tools ได้ แล้วให้มนุษย์อนุมัติ
5. Validating human input คือ บางครั้ง ก็จำเป็นต้องตรวจสอบ input จากมนุษย์ เช่น หากใส่อายุไม่ถูก ก็จะวนกลับไปถามใหม่โดยใช้ interupts ร่วมกับ loop

# Stream with human-in-the-loop (HITL) interrupts
หัวใจของการสร้าง User Experience (UX) ที่ดี" สำหรับ AI บน Production

Stream with HITL คือการทำให้ User ไม่ต้องนั่งมองหน้าจอว่างๆ ระหว่างที่ AI กำลังคิด แต่ให้เห็นการทำงานของ AI แบบเรียลไทม์ (Streaming) และเมื่อ AI เจอจุดที่ต้องถามมนุษย์ (Interrupt) ระบบจะหยุดการสตรีมข้อความแล้วเปลี่ยนเป็น "กล่องรับคำถาม" ทันที

### คืออะไร
คือการรัน Graph แบบ astream (สตรีมมิ่ง) ที่รองรับ 2 โหมดพร้อมกัน:

1. messages mode: เพื่อสตรีมตัวอักษรที่ AI พ่นออกมา (เหมือน ChatGPT) ให้ User เห็นทันที

2. updates mode: เพื่อสตรีม "สถานะของระบบ" ทำให้เราดักจับได้ทันทีว่า "ตอนนี้ติด Interrupt แล้วนะ!" เพื่อหยุดการสตรีมข้อความและแสดง UI ให้ User ตอบกลับ

### ใช้เพื่ออะไร
1. ลดความรู้สึกหน่วง (Perceived Latency): User เห็น AI พยายามพิมพ์คำอธิบายก่อนจะขออนุมัติ ทำให้ดูมีความเป็นธรรมชาติ

2. การโต้ตอบที่ลื่นไหล: ระบบสามารถแจ้ง User ได้ทันทีว่า "AI พิมพ์จบแล้ว และตอนนี้กำลังรอคุณตัดสินใจในขั้นตอนถัดไป"

```ts
const stream = await graph.astream(
  { input: "วิเคราะห์งบการเงิน Apple" },
  { 
    streamMode: ["messages", "updates"], // สตรีมทั้งข้อความและสถานะ Node
    configurable: { thread_id: "user_1" } 
  }
);

for await (const [mode, chunk] of stream) {
  if (mode === "messages") {
    // 1. สตรีมข้อความที่ AI พิมพ์ออกมาให้ User เห็นบนหน้าจอ
    process.stdout.write(chunk.content); 
  } 
  
  if (mode === "updates") {
    // 2. ตรวจสอบว่าใน State Update นี้มี Interrupt หรือไม่
    if (chunk.__interrupt__) {
      const info = chunk.__interrupt__[0].value;
      console.log(`\n\n⚠️ AI ต้องการความเห็น: ${info}`);
      
      // หยุดการวนลูปเพื่อรอรับคำตอบจาก User (ผ่าน API หรือ Prompt)
      break; 
    }
  }
}
```