# Shell integration for the OS's Terminal (decisions-terminal.md, 2026-11-20). At each prompt the shell
# says how the last command ended (OSC 133;D), where the prompt starts (133;A) and where typing starts
# (133;B, at the end of PS1); PS0 says where a command's output starts (133;C). It reports the working
# directory as a file:// URL (OSC 7) and titles the window with it (OSC 2). Alpine's /etc/bash/bashrc
# sources every /etc/bash/*.sh; this one runs only in the Terminal, which sets TERM_PROGRAM=imbatranim,
# so a Linux app's own terminal and scripts never run it. It adds to PROMPT_COMMAND and PS0 and never
# replaces a user's.
[ -n "$BASH_VERSION" ] || return 0
[ "$TERM_PROGRAM" = imbatranim ] || return 0
case $- in *i*) ;; *) return 0 ;; esac
[ -z "$__imbatranim_marks" ] || return 0
__imbatranim_marks=1

# Percent-encodes every byte outside URL's unreserved characters and "/", so a directory name that holds
# an escape or a newline arrives as text and never as a sequence (Ghostty's GHSA-2r63-vmw6-3m3c).
__imbatranim_urlencode() {
	local LC_ALL=C s=$1 out= c i n
	for ((i = 0; i < ${#s}; i++)); do
		c=${s:i:1}
		case $c in
		[A-Za-z0-9._~/-]) out+=$c ;;
		*)
			# A byte over 127 reads as negative under glibc's C locale and as U+DF80 plus the byte under
			# musl's; its low eight bits are the byte either way.
			printf -v n '%d' "'$c"
			((n &= 255))
			printf -v c '%%%02X' "$n"
			out+=$c
			;;
		esac
	done
	printf '%s' "$out"
}

__imbatranim_prompt() {
	local status=${__imbatranim_status:-$?}
	__imbatranim_status=
	# D only after the first prompt; the Terminal counts it only after a C.
	[ -z "$__imbatranim_prompted" ] || printf '\e]133;D;%s\a' "$status"
	__imbatranim_prompted=1
	printf '\e]133;A\a'
	printf '\e]7;file://%s%s\a' "$(__imbatranim_urlencode "$HOSTNAME")" "$(__imbatranim_urlencode "$PWD")"
	# The title: the directory, with ~ for the home, control characters made "?".
	local LC_ALL=C title=$PWD
	[ -z "$HOME" ] || [[ $title != "$HOME"* ]] || title="~${title#"$HOME"}"
	printf '\e]2;%s\a' "${title//[[:cntrl:]]/?}"
	# A ~/.bashrc may set its own PS1 after this file ran: mark where typing starts again.
	[[ $PS1 == *'133;B'* ]] || PS1+='\[\e]133;B\a\]'
}

# The status is taken first, before any other PROMPT_COMMAND entry runs; the marks come last, after them.
PROMPT_COMMAND=('__imbatranim_status=$?' "${PROMPT_COMMAND[@]}" __imbatranim_prompt)
PS1+='\[\e]133;B\a\]'
PS0+='\e]133;C\a'
