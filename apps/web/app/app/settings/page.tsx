import { SettingsView } from "./SettingsView";
import { isShowcaseMode } from "@/lib/runtime-server";

export default function SettingsPage(){return <SettingsView readOnly={isShowcaseMode()}/>}
