"use client"
import { useState } from "react"
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation"
import { ToolCall } from "@/components/chat-tool-call"
import { Button } from "@/components/ui/button"
export default function Review() {
 const [count,setCount]=useState(24)
 return <main className="flex h-svh flex-col"><header className="p-4">Temporary scrolling verification</header><Conversation><ConversationContent>
 {Array.from({length:count},(_,i)=><p key={i}>Message {i+1}: This checks conversation scrolling and the jump to latest control.</p>)}
 <ToolCall part={{type:"tool-readFile",toolCallId:"read",state:"output-available",input:{path:"/workspace/notes.txt"},output:{content:Array.from({length:100},(_,i)=>`Line ${i}: ${"long content ".repeat(40)}`).join("\n")}}}/>
 </ConversationContent><ConversationScrollButton/></Conversation><footer className="p-4"><Button onClick={()=>setCount(n=>n+1)}>Append message</Button></footer></main>
}
