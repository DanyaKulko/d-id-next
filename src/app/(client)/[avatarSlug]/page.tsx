import Link from "next/link";
import './page.css'
import Image from "next/image";
import logo from "@/assets/img/neil_avatar_logo.png";
import {AvatarPageClient} from "@/app/(client)/[avatarSlug]/page.client";
import {didService} from "@/lib/services/did.service";

export default async function AvatarPage () {
    const agent = await didService.getAgent('v2_agt_kIkd4Xm-').catch(err => err.toJSON()); // TODO: get from avatarSlug
    console.log(agent)
    return (
        <>
            <header className="na-header">
                <div className="na-container">
                    <div className="na-header-content">
                        <div className="na-logo-text">NEIL AVATAR</div>
                        <Link href="/" className="na-back-link">← Back to Roles</Link>
                    </div>
                </div>
            </header>

            <main className="na-container">
                <AvatarPageClient agent={agent}/>

                <div className="na-brand-logo">
                    <Image src={logo} alt={'logo'} />
                </div>
            </main>
        </>
    );
};
