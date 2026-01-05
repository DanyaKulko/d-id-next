import './page.css'
import Image from "next/image";
import logo from "@/assets/img/neil_avatar_logo.png";
import Link from "next/link";
import UserGuideModal from "@/components/UserGuideModal/UserGuideModal";

const avatars = [
    {
        id: 1,
        name: 'Basic Neil',
        description: 'The core personality of Neil, covering general topics and everyday conversations',
        videoUrl: 'https://neilavatar.com/data/neilcycle.mp4',
    },
    {
        id: 2,
        name: 'Tourism Neil',
        description: 'Expert travel guide sharing experiences from adventures around the world',
        videoUrl: 'https://neilavatar.com/data/neilcycle.mp4',
    },
    {
        id: 3,
        name: 'Sports Neil',
        description: 'Sports enthusiast discussing athletics, games, and competitive activities',
        videoUrl: 'https://neilavatar.com/data/neilcycle.mp4',
    },
    {
        id: 4,
        name: 'Politics Neil',
        description: 'Political analyst sharing insights on governance and current affairs',
        videoUrl: 'https://neilavatar.com/data/neilcycle.mp4',
    },
    {
        id: 5,
        name: 'Space Neil',
        description: 'Aviation and space enthusiast exploring the cosmos and aerospace technology',
        videoUrl: 'https://neilavatar.com/data/neilcycle.mp4',
    },
];

export default function Home() {
    return (
        <>
            {/*<UserAgreementModal/>*/}
            <UserGuideModal/>
            <header className="na-header">
                <div className="na-container">
                    <div className="na-header-content">
                        <div className="na-logo-text">NEIL AVATAR</div>
                        <div className="na-header-title">
                            <h1 className="na-title-display na-glow">Choose Your Neil Avatar Role</h1>
                            <p className="na-subtitle">Select one of five specialized versions of Neil to begin your
                                conversation</p>
                        </div>
                    </div>
                </div>
            </header>

            <main className="na-container">
                <div className="na-roles-grid">
                    {avatars.map(avatar => (
                        <Link href={`./${avatar.id}`} key={avatar.id} className={`na-card na-card--${avatar.id === 1 ? 'full' : 'half'}`}>
                            <video className="na-card-video" autoPlay loop muted playsInline>
                                <source src={avatar.videoUrl} type="video/mp4"/>
                            </video>
                            <div className="na-card-overlay"></div>
                            <div className="na-card-content">
                                <h3 className="na-card-title">{avatar.name}</h3>
                                <p className="na-card-desc">{avatar.description}</p>
                            </div>
                        </Link>
                    ))}
                </div>

                <div className="na-brand-logo">
                    <Image src={logo} alt={'logo'} />
                </div>
            </main>
        </>
    );
}
