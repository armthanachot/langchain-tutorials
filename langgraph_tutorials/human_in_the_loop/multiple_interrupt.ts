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
import * as z from "zod";

const state = new StateSchema({
    taxId: z.string(),
    taxRate: z.number(),
    transactionId: z.string(),
    finance_approved: z.object({
        approved: z.boolean(),
        comment: z.string(),
    }),
    tech_approved: z.object({
        approved: z.boolean(),
        comment: z.string(),
    }),
})

const financeNode: GraphNode<typeof state> = async (state) => {
    const { approved, comment } = interrupt("ช่วยอนุมัติงานนี้ให้ผ่านหรือไม่?");
    if (approved) {
        return { finance_approved: { approved: true, comment } };
    } else {
        return { finance_approved: { approved: false, comment } };
    }
}

const techNode: GraphNode<typeof state> = async (state) => {
    const { approved, comment } = interrupt("ช่วยเช็คสถานะของงานนี้ให้ผ่านหรือไม่?");
    if (approved) {
        return { tech_approved: { approved: true, comment } };
    } else {
        return { tech_approved: { approved: false, comment } };
    }
}


const checkpointer = new MemorySaver();
const builder = new StateGraph(state)
    .addNode("finance", financeNode)
    .addNode("tech", techNode)
    .addEdge(START, "finance")
    .addEdge(START, "tech")
    // ใช้ START ซ้อนกันแบบนี้แปลว่า ทำงานพร้อมกัน
    .addEdge("finance", END)
    .addEdge("tech", END)
    // หาก START pararell แล้ว ต้องมี END ซ้อนกัน

const graph = builder.compile({ checkpointer });

const config = {
    configurable: { thread_id: "1234567890" }
};
let out = await graph.invoke({ taxId: "1234567890", taxRate: 10, transactionId: "1234567890" }, config);

const interrupID: string[] = [];
const resumeObject: { [key: string]: any } = {};


if ("__interrupt__" in out) {
    for (const interrupt of out.__interrupt__ as { id: string, value: any }[]) {
        interrupID.push(interrupt.id);
    }

    resumeObject[interrupID[0]!] = { approved: true, comment: "อนุมัติ" };
    resumeObject[interrupID[1]!] = { approved: false, comment: "ไม่อนุมัติ" }; // mockup เพราะเรามีแค่ 2 interrupt จริงๆ ควรจะเป็นตามจำนวน interrupt ที่มี

    console.log(resumeObject);

    out = await graph.invoke(new Command({ resume: resumeObject }), config);
}

console.log(out);