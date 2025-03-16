import { proxy } from "valtio";

interface IGlobalStore {
  selectedFile: string;
}

export const globalStore = proxy<IGlobalStore>({
  selectedFile: "",
});
