import dotenv from "dotenv";
dotenv.config();
import { processarMensagem } from "./bot/conversation.js";

const resposta = await processarMensagem("oi, voces vendem pijama?");
console.log(resposta);