import { StateGraph, START, END, StateSchema, type GraphNode, Command, interrupt } from "@langchain/langgraph";
import * as z from "zod";
import checkpointer from "./checkpointer";

const State = new StateSchema({
    sqlQuery: z.string(),
    result: z.string().optional(),
    needApproval: z.boolean(),
    errMessage: z.string().optional(),
});

const validatorNode: GraphNode<typeof State> = async (state) => {
    const { sqlQuery } = state;
    if (sqlQuery.toLowerCase().includes("delete")) {
        return new Command({ goto: "approval", update: { needApproval: true } });
    } else {
        return new Command({ goto: "execute" });
    }
};

const approvalNode: GraphNode<typeof State> = async (state) => {
    const { needApproval, sqlQuery } = state;
    const { isApproved, comment } = await interrupt(`Are you sure you want to execute this SQL? ${sqlQuery}`);
    console.log("isApproved: ", isApproved);
    console.log("comment: ", comment);

    if (isApproved) {
        console.log("user approved");

        return new Command({ goto: "execute" });
    } else {
        console.log("user rejected");
        return new Command({ goto: END, update: { errMessage: `User rejected the request: ${comment}` } });
    }
}

const executeNode: GraphNode<typeof State> = async (state) => {
    const { sqlQuery } = state;
    console.log(`execute ${sqlQuery}`);
    return new Command({ goto: END, update: { result: "SQL executed successfully" } });
}

const builder = new StateGraph(State).addNode("validator", validatorNode, { ends: ["approval", "execute"] }).
    addNode("approval", approvalNode, { ends: ["execute", END] }).
    addNode("execute", executeNode).
    addEdge(START, "validator")

const graph = builder.compile({ checkpointer: checkpointer });
export default graph;