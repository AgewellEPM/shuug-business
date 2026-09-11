import { setting, saveSecrets } from "../connections/vault";
export interface QboTokens { accessToken:string;refreshToken:string;realmId:string;expiresAt:number }
export function getQboTokens():QboTokens|null { const raw=setting("QBO_TOKENS"); return raw?JSON.parse(raw):null; }
export function setQboTokens(tokens:QboTokens):void { saveSecrets({QBO_TOKENS:JSON.stringify(tokens)}); }
export function clearQboTokens():void { saveSecrets({QBO_TOKENS:""}); }
