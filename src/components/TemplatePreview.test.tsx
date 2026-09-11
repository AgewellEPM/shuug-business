import { fireEvent,render,screen } from "@testing-library/react";
import { expect,it,vi } from "vitest";
import { TemplatePreview } from "./TemplatePreview";
import { TEMPLATES } from "@/lib/features/catalog";
it("previews table and editable form without creating a tracker",()=>{const use=vi.fn(),customize=vi.fn();render(<TemplatePreview template={TEMPLATES[0]} onClose={vi.fn()} onUse={use} onCustomize={customize}/>);expect(screen.getByRole("table")).toBeInTheDocument();expect(screen.getByText(/fictional examples/)).toBeInTheDocument();fireEvent.click(screen.getByRole("button",{name:"Entry form"}));fireEvent.change(screen.getByLabelText(/Business/),{target:{value:"My preview company"}});expect(use).not.toHaveBeenCalled();expect(customize).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("button",{name:"Use template"}));expect(use).toHaveBeenCalledOnce();});
