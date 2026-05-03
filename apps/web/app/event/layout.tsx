import ScrollToTop from "@/components/utility/ScrollToTop"
import { ReactNode } from "react"

interface Props {
    children: ReactNode
}

export default function Layout({ children }: Props) {
    return (
        <div>
            {children}
            <ScrollToTop />
        </div>
    )
}