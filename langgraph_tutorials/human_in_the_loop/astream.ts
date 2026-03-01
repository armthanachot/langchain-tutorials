import { 
    Annotation, 
    StateGraph, 
    START, 
    END, 
    MemorySaver, 
    interrupt, 
    Command,
    MessagesValue
  } from "@langchain/langgraph";
  import { AIMessageChunk } from "@langchain/core/messages";
  
  // 1. นิยามโครงสร้างของ State
  const State = Annotation.Root({
    messages: Annotation<any[]>({
      reducer: (left, right) => left.concat(right),
      default: () => [],
    }),
    status: Annotation<string>(),
  });
  
  // 2. สร้าง Node ที่มีการใช้งาน interrupt [3]
  const approvalNode = async (state: typeof State.State) => {
    console.log("--- เข้าสู่ขั้นตอนการขออนุมัติ ---");
    
    // ใช้ interrupt() เพื่อหยุดรอการยืนยันจากมนุษย์
    // ค่าที่ส่งเข้าไปจะไปปรากฏที่ __interrupt__ ในฝั่ง caller [4], [3]
    const userApproval = interrupt("คุณต้องการดำเนินการต่อหรือไม่? (yes/no)");
  
    // เมื่อระบบ resume กลับมา ค่าที่มนุษย์ส่งมาจะกลายเป็นค่าของ userApproval [5]
    if (userApproval === "yes") {
      return { status: "ดำเนินการสำเร็จ" };
    } else {
      return { status: "ถูกปฏิเสธโดยผู้ใช้" };
    }
  };
  
  // 3. ตั้งค่า Graph
  const workflow = new StateGraph(State)
    .addNode("approval_step", approvalNode)
    .addEdge(START, "approval_step")
    .addEdge("approval_step", END);
  
  // 4. คอมไพล์ Graph พร้อมกับ Checkpointer เพื่อจัดการ Persistence [6], [7]
  const checkpointer = new MemorySaver();
  const graph = workflow.compile({ checkpointer });
  
  async function runStreamingAgent() {
    const config = { configurable: { thread_id: "example-thread-123" } };
    let initialInput = { messages: [{ role: "user", content: "เริ่มการทำงาน" }] };
  
    // 5. การสตรีมแบบ Dual Mode: "messages" และ "updates" [1], [8]
    // ใช้ subgraphs: true เพื่อให้ตรวจจับ interrupt ได้แม่นยำ [2]
    const stream = await graph.stream(initialInput, {
      streamMode: ["messages", "updates"],
      subgraphs: true,
      ...config
    });
  
    console.log("--- เริ่มการ Streaming ---");
  
    for await (const [metadata, mode, chunk] of stream) {
      if (mode === "messages") {
        // จัดการสตรีมข้อความจาก AI (ถ้ามี)
        const [msg] = chunk;
        if (msg instanceof AIMessageChunk && msg.content) {
          process.stdout.write(msg.content as string);
        }
      } else if (mode === "updates") {
        // 6. ตรวจจับการ Interrupt [8], [2]
        if ("__interrupt__" in chunk) {
          const interruptInfo = (chunk as any).__interrupt__.value;
          console.log(`\n[INTERRUPT]: ${interruptInfo}`);
  
          // จำลองการรับ Input จากมนุษย์
          const humanInput = "no"; // ในการใช้งานจริงอาจมาจาก UI หรือ API
          console.log(`[HUMAN RESPONSE]: ${humanInput}`);
  
          // 7. สั่งให้ทำงานต่อโดยใช้ Command({ resume: ... }) [5], [2]
          const resumeStream = await graph.stream(new Command({ resume: humanInput }), {
            streamMode: ["messages", "updates"],
            subgraphs: true,
            ...config
          });
          
          // วนลูปประมวลผล stream ที่เหลือหลังจาก resume
          for await (const [m, mo, ch] of resumeStream) {
            if (mo === "updates") console.log("Update after resume:", ch);
          }
          break; 
        }
        
        // แสดงสถานะการเปลี่ยน Node
        console.log(`\n[NODE]: ${Object.keys(chunk)}`);
      }
    }
  }

  runStreamingAgent();