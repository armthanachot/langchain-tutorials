import { StateGraph, START, END, StateSchema, task, type GraphNode } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { Pool } from "pg";  //bun add @types/pg
import * as z from "zod";

const State = new StateSchema({
    url: z.string(),
    result: z.string().optional(),
});
console.log(process.env.DB_URL);


const pool = new Pool({
    connectionString: process.env.DB_URL,
});

const checkpointer = new PostgresSaver(pool);
await checkpointer.setup(); // สร้าง table checkpoints ใน database

const makeRequest = task("makeRequest", async (url: string) => {
    console.log(2);

    const response = await fetch(url);
    const text = await response.text();
    return text;
});

const textSlice = task("textSlice", async (text: string) => {
    console.log(3);
    // throw new Error("Simulated Failure!"); // เปิด comment เพื่อแกล้งให้พังตรงนี้ เพื่อทดสอบการ Resume
    return text.slice(0, 100);
});

const callApi: GraphNode<typeof State> = async (state) => {
    console.log(1);

    const response = await makeRequest(state.url);
    return {
        result: await textSlice(response),
    };
};

const builder = new StateGraph(State)
    .addNode("callApi", callApi)
    .addEdge(START, "callApi") // เมื่อเริ่มกราฟ จะไปที่ node "callApi"
    .addEdge("callApi", END); // เมื่อ node "callApi" สำเร็จ จะไปที่ node "END"

const graph = builder.compile({ checkpointer });


const myFunc = async (request: { thread_id: string, input: string }) => {
    const config = {
        configurable: { thread_id: request.thread_id }
    };

    try {
        // ตรวจสอบสถานะปัจจุบันใน Database
        const currentState = await graph.getState(config);

        // ตรวจดูว่ามีขั้นตอนที่ต้องทำต่อ (Next Nodes) หรือไม่
        const isPausedOrFailed = currentState.next && currentState.next.length > 0;
console.log("isPausedOrFailed", isPausedOrFailed);
        if (isPausedOrFailed) {
            // --- SCENARIO: RECOVERY ---
            console.log(`[RECOVERY] Resuming work for thread: ${request.thread_id}`);
            // ส่ง null เพื่อสั่งให้รันต่อจากสถานะล่าสุดใน Checkpointer
            return await graph.invoke(null, config);
        } else {
            // --- SCENARIO: NEW TASK ---
            console.log(`[NEW] Starting new work for thread: ${request.thread_id}`);
            // ตรวจสอบว่ามี Input หรือไม่
            if (!request.input) throw new Error("Input data required for new tasks");
            return await graph.invoke({ url: request.input }, config);
        }
    } catch (error) {
        console.error(`[ERROR] Thread ${request.thread_id} failed:`, error);
        // ใน Production จริง คุณอาจจะส่งแจ้งเตือนไปที่ Slack หรือ Monitoring tools
        return { status: "error", message: "Task state saved, ready for retry." };
    }
}

await myFunc({ thread_id: "1234567890", input: "https://pokeapi.co/api/v2/pokemon" });