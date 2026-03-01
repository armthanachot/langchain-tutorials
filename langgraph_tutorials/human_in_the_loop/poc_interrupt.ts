import {
    Annotation,
    StateGraph,
    START,
    END,
    MemorySaver,
    interrupt,
    Command,
    MessagesValue,
    StateSchema,
    type GraphNode
} from "@langchain/langgraph";
import { AIMessageChunk } from "@langchain/core/messages";
import * as z from "zod";


const State = new StateSchema({
    url: z.string(),
    result: z.string().optional(),
});

const approvalNode: GraphNode<typeof State> = async (state) => {
    console.log("--- เข้าสู่ขั้นตอนการขออนุมัติ ---");

    // ใช้ interrupt() เพื่อหยุดรอการยืนยันจากมนุษย์
    // ค่าที่ส่งเข้าไปจะไปปรากฏที่ __interrupt__ ในฝั่ง caller [4], [3]
    const userApproval = interrupt("คุณต้องการดำเนินการต่อหรือไม่? (yes/no)"); // เพื่อส่ง response ออกไปก่อน เพื่อรอการยืนยันจากมนุษย์  พอได้ response มาแล้ว มันก็กลับมา function นี้อยู่ดี แต่ว่ามันจะไม่ interrupt อีกครั้ง

    console.log("received user approval: ", userApproval);
    
    // เมื่อระบบ resume กลับมา ค่าที่มนุษย์ส่งมาจะกลายเป็นค่าของ userApproval [5]
    if (userApproval === "yes") {
        console.log("human input: yes");
        return { result: "ดำเนินการสำเร็จ" };
    } else {
        console.log("human input: no");
        return { result: "ถูกปฏิเสธโดยผู้ใช้" };
    }
};

const builder = new StateGraph(State)
    .addNode("approval_step", approvalNode) // เมื่อถูก invoke จะเริ่มทำงานที่ approvalNode ก่อน
    .addEdge(START, "approval_step")
    .addEdge("approval_step", END);

const checkpointer = new MemorySaver();
const graph = builder.compile({ checkpointer });


const config = {
    configurable: { thread_id: "1234567890" }
};
let out = await graph.invoke({ url: "https://pokeapi.co/api/v2/pokemon" }, config);

console.log(out);

console.log("--------------------------------");


if ("__interrupt__" in out) { // เช็คว่ามี interrupt หรือไม่
    //wait for human input
    console.log("waiting for human input...");
    console.log("human input: yes");
    out = await graph.invoke(new Command({ resume: "yes" }), config); // ส่งคำส่งอนุมัติกลับไป
}

console.log(out);