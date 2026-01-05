'use client';
import { useEffect, useState } from 'react';

const LS_KEY = 'na_user_agreement';
const AGREEMENT_VERSION = 'v1';

export const UserAgreementModal = () => {
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const saved = localStorage.getItem(LS_KEY);
        setIsOpen(saved !== AGREEMENT_VERSION);
    }, []);

    const onAccept = () => {
        localStorage.setItem(LS_KEY, AGREEMENT_VERSION);
        setIsOpen(false);
    };

    const onDecline = () => {
        document.documentElement.innerHTML = '';
    };

    if (!isOpen) return null;

    return (
        <div className="na-modal active" id="agreementModal">
            <div className="na-modal-content">
                <h2 className="na-modal-title">Welcome to Neil Avatar</h2>
                <p className="na-modal-text">
                    This is an AI-generated digital avatar based on a real person. All responses are generated using
                    artificial intelligence and may not reflect the actual views or statements of the real
                    individual. By
                    proceeding, you acknowledge that you are interacting with an AI system and agree to use this
                    service
                    responsibly.
                </p>
                <p className="na-modal-text">
                    <strong>Please note:</strong> All content is AI-generated and should not be considered as
                    professional
                    advice or factual statements from the real person.
                </p>
                <button className="na-btn na-btn--primary" type='button' onClick={onAccept}>I Understand and Agree
                </button>
                <button className="na-btn na-btn--secondary" type='button' onClick={onDecline}>Decline</button>
            </div>
        </div>
    );
};
