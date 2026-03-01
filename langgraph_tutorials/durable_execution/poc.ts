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
await graph.invoke({ url: "https://pokeapi.co/api/v2/pokemon" }, config);
try {

} catch (error) {
    console.error("first run failed (expected):", error);
    console.log("snapshot after fail:", await graph.getState(config));
}

const out = await graph.invoke(null as any, config);

console.log("output:", out);