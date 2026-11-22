# The Terminal's prompt when the home has no ~/.bashrc of its own (decisions-terminal.md, 2026-11-20).
# Alpine's bash reads /etc/bash/bashrc as an interactive shell, and that file sources every
# /etc/bash/*.sh, this one among them, before the user's ~/.bashrc. A home with its own ~/.bashrc
# decides its prompt there, so nothing here touches it.
if [ ! -f "$HOME/.bashrc" ]; then
	PS1='\u@\h:\w\$ '
fi
