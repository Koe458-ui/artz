from __future__ import annotations

import argparse
import json
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

from ored.config import Config, load_config
from ored.utils.logging_utils import get_logger, section

logger = get_logger(__name__)

SPLITS = ("train", "val", "test")

NAMES = [
    'robert', 'alejandro', 'mandy', 'kenneth', 'miguel', 'james', 'ashlee', 'evan',
    'david', 'ryan', 'anna', 'grant', 'angela', 'michael', 'susan', 'christopher',
    'tiffany', 'william', 'eddie', 'jennifer', 'matthew', 'andrew', 'tammy', 'julie',
    'adam', 'shelby', 'monica', 'kelli', 'harold', 'cory', 'nicole', 'belinda',
    'jill', 'jesse', 'alexandra', 'jenna', 'mallory', 'lindsay', 'morgan', 'javier',
    'laurie', 'jacob', 'brianna', 'april', 'bob', 'frank', 'tonya', 'marilyn',
    'edward', 'jermaine', 'amber', 'eric', 'mario', 'brandon', 'christian', 'virginia',
    'samantha', 'kristina', 'kelsey', 'erika', 'kathleen', 'timothy', 'bryan', 'connie',
    'mark', 'chelsea', 'stephanie', 'kayla', 'holly', 'frederick', 'jerry', 'keith',
    'amanda', 'aaron', 'tyler', 'jack', 'cathy', 'lauren', 'cody', 'richard',
    'krystal', 'john', 'natalie', 'anthony', 'ralph', 'gregory', 'erin', 'heather',
    'carlos', 'steven', 'christine', 'derek', 'patricia', 'kelly', 'emily', 'jordan',
    'ronald', 'zachary', 'audrey', 'crystal', 'nathan', 'jeanette', 'austin', 'gina',
    'shane', 'joseph', 'jo', 'erica', 'sarah', 'carrie', 'randy', 'hunter',
    'rachel', 'jessica', 'meghan', 'charles', 'kevin', 'kristen', 'billy', 'jake',
    'lisa', 'roger', 'alexander', 'daniel', 'willie', 'lacey', 'luis', 'jamie',
    'ashley', 'justin', 'melissa', 'allison', 'andrea', 'diane', 'alexandria', 'kimberly',
    'angel', 'elaine', 'miranda', 'andre', 'thomas', 'lawrence', 'annette', 'brian',
    'cole', 'kyle', 'jay', 'colin', 'victor', 'jeffrey', 'fernando', 'victoria',
    'vicki', 'sandra', 'danielle', 'erik', 'melinda', 'alexis', 'ann', 'joe',
    'tina', 'jeremiah', 'mitchell', 'hannah', 'elizabeth', 'debra', 'michelle', 'robin',
    'renee', 'micheal', 'ricardo', 'gail', 'george', 'tara', 'paul', 'daisy',
    'raymond', 'jason', 'laura', 'anita', 'allen', 'kristopher', 'phillip', 'evelyn',
    'deborah', 'veronica', 'wayne', 'dominique', 'teresa', 'jacqueline', 'sabrina', 'jade',
    'maria', 'leroy', 'philip', 'peter', 'dawn', 'jodi', 'karen', 'ethan',
]

NOUNS = [
    'prince', 'man', 'time', 'face', 'room', 'princess', 'war', 'life',
    'way', 'hand', 'day', 'army', 'count', 'head', 'right', 'government',
    'place', 'state', 'house', 'emperor', 'bone', 'disease', 'skin', 'tissue',
    'round', 'blood', 'power', 'father', 'form', 'door', 'countess', 'moment',
    'love', 'end', 'chapter', 'treatment', 'officer', 'voice', 'congress', 'battle',
    'history', 'case', 'law', 'position', 'smile', 'country', 'order', 'course',
    'result', 'night', 'patient', 'work', 'cause', 'president', 'wife', 'infection',
    'matter', 'god', 'feeling', 'world', 'action', 'question', 'movement', 'condition',
    'son', 'mind', 'body', 'morning', 'horse', 'death', 'labor', 'money',
    'woman', 'nerve', 'act', 'expression', 'fig', 'use', 'half', 'business',
    'mother', 'commander', 'year', 'wound', 'pain', 'thing', 'number', 'party',
    'word', 'table', 'home', 'constitution', 'enemy', 'fact', 'letter', 'project',
    'example', 'west', 'illustration', 'friend', 'land', 'surface', 'light', 'fire',
    'union', 'evening', 'arm', 'road', 'heart', 'line', 'system', 'rise',
    'force', 'king', 'pressure', 'hair', 'fellow', 'regiment', 'air', 'peace',
    'crowd', 'growth', 'news', 'point', 'service', 'interest', 'bed', 'process',
    'sound', 'opinion', 'self', 'limb', 'presence', 'trade', 'formation', 'soldier',
    'operation', 'field', 'slavery', 'family', 'rest', 'answer', 'neck', 'period',
    'kind', 'revolution', 'foot', 'husband', 'abscess', 'lymph', 'spread', 'company',
    'middle', 'attention', 'reason', 'campaign', 'return', 'wall', 'effect', 'water',
    'window', 'person', 'subject', 'dinner', 'size', 'daughter', 'doctor', 'honor',
    'strength', 'conversation', 'city', 'street', 'view', 'account', 'brother', 'lady',
    'paper', 'sir', 'child', 'character', 'town', 'court', 'coat', 'freedom',
    'knee', 'cancer', 'ground', 'nature', 'seat', 'boy', 'nation', 'society',
    'artery', 'soul', 'spirit', 'fear', 'girl', 'reply', 'tone', 'mouth',
    'area', 'need', 'village', 'plan', 'ulcer', 'attack', 'hour', 'bridge',
    'membrane', 'doubt', 'muscle', 'command', 'convention', 'independence', 'change', 'hope',
    'john', 'st', 'direction', 'opening', 'governor', 'leg', 'capital', 'sister',
    'smoke', 'staff', 'study', 'carriage', 'colonel', 'cry', 'happiness', 'loss',
    'firm', 'idea', 'master', 'method', 'group', 'pleasure', 'relation', 'sarcoma',
    'step', 'camp', 'dress', 'influence', 'age', 'property', 'vessel', 'duty',
    'industry', 'silence', 'appearance', 'chair', 'manner', 'march', 'uncle', 'story',
    'term', 'lord', 'activity', 'office', 'victory', 'effort', 'injury', 'dressing',
    'sight', 'corner', 'series', 'silver', 'captain', 'everybody', 'future', 'book',
    'gold', 'ball', 'danger', 'fall', 'tariff', 'uniform', 'control', 'finger',
    'portion', 'majority', 'purpose', 'rule', 'clock', 'health', 'commerce', 'election',
    'distance', 'meeting', 'administration', 'church', 'earth', 'importance', 'post', 'region',
    'section', 'spite', 'affair', 'glass', 'policy', 'shoulder', 'vein', 'increase',
    'meaning', 'note', 'suffrage', 'truth', 'diagnosis', 'reading', 'senate', 'territory',
    'aid', 'development', 'division', 'treaty', 'river', 'tomorrow', 'destruction', 'event',
    'difficulty', 'eye', 'passage', 'vote', 'bank', 'solution', 'aim', 'experience',
    'removal', 'stage', 'hill', 'surprise', 'tea', 'care', 'floor', 'healing',
    'value', 'hat', 'cartilage', 'support', 'connection', 'figure', 'nose', 'object',
    'progress', 'sense', 'temperature', 'lesion', 'majesty', 'instant', 'issue', 'mass',
    'authority', 'discharge', 'flank', 'fluid', 'path', 'population', 'bill', 'extent',
    'gentleman', 'sign', 'absence', 'fate', 'notice', 'cap', 'democracy', 'sake',
    'source', 'cavity', 'chance', 'desire', 'fight', 'marriage', 'opposition', 'reaction',
    'tenderness', 'advance', 'practice', 'shot', 'week', 'cannon', 'degree', 'police',
    'retreat', 'century', 'circulation', 'hearing', 'inflammation', 'measure', 'soil', 'success',
    'today', 'elbow', 'glance', 'official', 'sort', 'porch', 'amendment', 'joy',
    'possibility', 'scar', 'significance', 'estate', 'tender', 'wood', 'contact', 'maid',
    'regard', 'report', 'shock', 'situation', 'type', 'breast', 'drive', 'foundation',
    'lodge', 'necessity', 'nonsense', 'rupture', 'snow', 'justice', 'tendency', 'infantry',
    'sofa', 'supply', 'tax', 'agitation', 'hall', 'heat', 'minute', 'variety',
    'sea', 'speech', 'sun', 'chest', 'companion', 'conception', 'favor', 'press',
    'visit', 'cotton', 'interference', 'cavalry', 'evidence', 'laughter', 'legislature', 'suite',
    'theory', 'yard', 'battery', 'circle', 'consciousness', 'iron', 'liberty', 'marrow',
    'origin', 'peasant', 'repair', 'slave', 'understanding', 'valley', 'application', 'cent',
    'demand', 'respect', 'tuberculosis', 'wealth', 'address', 'attempt', 'council', 'forest',
    'problem', 'spot', 'stream', 'struggle', 'box', 'conflict', 'fever', 'food',
    'island', 'paralysis', 'pity', 'risk', 'genius', 'material', 'minister', 'supreme',
    'visitor', 'affection', 'amputation', 'burst', 'class', 'information', 'railway', 'sac',
    'sensation', 'ship', 'trunk', 'addition', 'attitude', 'blow', 'canal', 'clay',
    'devil', 'empire', 'enterprise', 'examination', 'proportion', 'settlement', 'stone', 'touch',
    'arthritis', 'club', 'compromise', 'cure', 'frontier', 'knowledge', 'shaft', 'skull',
    'agreement', 'beauty', 'center', 'charge', 'clot', 'gauze', 'heaven', 'lad',
    'laugh', 'nurse', 'spring', 'square', 'weight', 'copyright', 'deal', 'journey',
    'share', 'sheath', 'yesterday', 'arrival', 'darkness', 'garden', 'sky', 'trust',
    'wrist', 'cyst', 'defense', 'impression', 'occurrence', 'promise', 'rate', 'satisfaction',
    'throat', 'youth', 'forehead', 'immigration', 'intention', 'marshal', 'opportunity', 'relief',
    'sacrifice', 'squadron', 'tongue', 'bell', 'cost', 'debt', 'doctrine', 'gate',
    'parliament', 'space', 'dog', 'existence', 'faith', 'fracture', 'horror', 'irritation',
    'month', 'supper', 'william', 'advantage', 'advice', 'bit', 'conduct', 'degeneration',
    'gun', 'length', 'protection', 'wolf', 'cloak', 'column', 'commission', 'distribution',
    'domain', 'excitement', 'shape', 'acid', 'admission', 'contraction', 'credit', 'crime',
    'crown', 'curiosity', 'decision', 'feature', 'grant', 'language', 'legislation', 'piece',
    'summer', 'wine', 'arrest', 'departure', 'edge', 'gesture', 'hurrah', 'injection',
    'motion', 'nail', 'prisoner', 'science', 'sorrow', 'triumph', 'anger', 'entrance',
    'page', 'reform', 'search', 'approval', 'brain', 'conclusion', 'confusion', 'explanation',
    'extension', 'hut', 'leadership', 'reception', 'shadow', 'vice', 'animal', 'colony',
    'education', 'function', 'offer', 'resolution', 'sympathy', 'terror', 'train', 'trouble',
    'access', 'acquaintance', 'artillery', 'candidate', 'cart', 'grain', 'guard', 'handkerchief',
    'lip', 'music', 'pipe', 'principle', 'republic', 'sinus', 'virtue', 'agriculture',
    'appeal', 'article', 'aspect', 'drink', 'game', 'habit', 'hero', 'household',
    'memory', 'possession', 'ring', 'band', 'cast', 'contest', 'enlargement', 'exercise',
    'base', 'building', 'confidence', 'deformity', 'excuse', 'executive', 'gown', 'humanity',
    'leader', 'league', 'level', 'serum', 'sum', 'test', 'welfare', 'alarm',
    'assistance', 'aunt', 'branch', 'coachman', 'consent', 'dignity', 'extremity', 'fool',
    'gland', 'market', 'occupation', 'permission', 'platform', 'secretary', 'station', 'winter',
    'alliance', 'inevitability', 'layer', 'mood', 'necrosis', 'occasion', 'pistol', 'pocket',
    'recovery', 'remark', 'separation', 'sugar', 'thumb', 'whisper', 'assistant', 'centre',
    'contrast', 'corps', 'currency', 'declaration', 'farm', 'fault', 'imagination', 'instance',
    'member', 'midst', 'print', 'purchase', 'shirt', 'silk', 'smell', 'armchair',
    'baker', 'ballot', 'bandage', 'epidermis', 'exposure', 'fashion', 'glory', 'highness',
    'junction', 'pulse', 'scene', 'substance', 'task', 'vicinity', 'violence', 'wind',
    'aide', 'conviction', 'date', 'dispute', 'engagement', 'flight', 'flow', 'footman',
    'forearm', 'list', 'management', 'province', 'ruin', 'tobacco', 'weakness', 'art',
    'border', 'confederation', 'delay', 'drop', 'gap', 'grief', 'hip', 'illness',
    'income', 'kiss', 'rapidity', 'resistance', 'review', 'anxiety', 'autumn', 'benefit',
    'bottle', 'bullet', 'choice', 'copy', 'cord', 'defeat', 'difference', 'duke',
    'ear', 'headquarters', 'hospital', 'message', 'provision', 'quarter', 'servant', 'stamp',
    'stranger', 'association', 'baby', 'battalion', 'bedroom', 'corn', 'couple', 'dancing',
    'despair', 'dream', 'energy', 'federation', 'hurry', 'judge', 'monsieur', 'mustache',
    'price', 'proclamation', 'production', 'rank', 'scale', 'senator', 'tube', 'friendship',
    'gain', 'medium', 'militia', 'powder', 'reference', 'severity', 'valet', 'absorption',
    'balance', 'beard', 'bow', 'breathing', 'cheek', 'china', 'claim', 'combination',
    'delight', 'fortune', 'hunter', 'icon', 'inquiry', 'invasion', 'program', 'stomach',
    'surgeon', 'angel', 'color', 'communication', 'disturbance', 'gallop', 'harm', 'hay',
    'jersey', 'knife', 'mercy', 'organization', 'prayer', 'race', 'reconstruction', 'role',
    'saber', 'statement', 'surgery', 'sword', 'tetanus', 'thrust', 'trap', 'tree',
    'weather', 'wool', 'childhood', 'civilization', 'courage', 'factor', 'knoll', 'merchant',
    'mist', 'photograph', 'pride', 'reasoning', 'record', 'responsibility', 'saddle', 'sensibility',
    'shell', 'structure', 'vitality', 'warfare', 'approach', 'assembly', 'basis', 'coast',
    'cousin', 'dance', 'enthusiasm', 'equality', 'establishment', 'grass', 'license', 'liver',
    'needle', 'pace', 'pair', 'pause', 'quantity', 'ray', 'request', 'sergeant',
    'tail', 'tension', 'whip', 'appointment', 'baggage', 'capacity', 'career', 'coal',
    'committee', 'compression', 'contempt', 'dust', 'failure', 'haven', 'historian', 'machine',
    'manufacturing', 'mistake', 'mystery', 'observation', 'oil', 'organism', 'payment', 'proposal',
    'rain', 'range', 'ratification', 'representative', 'revenue', 'steward', 'strike', 'thigh',
    'thrombosis', 'title', 'alcohol', 'angle', 'breath', 'check', 'cloth', 'darling',
    'detail', 'dislocation', 'fur', 'goodness', 'map', 'mark', 'navy', 'noise',
    'pulsation', 'regeneration', 'reign', 'sigh', 'song', 'temper', 'treasury', 'trial',
    'wedding', 'wheat', 'archive', 'axis', 'battlefield', 'collar', 'continent', 'culture',
    'debate', 'deed', 'detachment', 'disposition', 'district', 'focus', 'folk', 'frost',
    'lamp', 'onset', 'reproach', 'safety', 'surrender', 'suture', 'wonder', 'abolition',
]

ADJECTIVES = [
    'new', 'old', 'french', 'little', 'long', 'great', 'good', 'whole',
    'young', 'small', 'large', 'dear', 'free', 'joint', 'certain', 'white',
    'possible', 'necessary', 'open', 'high', 'red', 'common', 'important', 'second',
    'different', 'early', 'full', 'cold', 'impossible', 'third', 'short', 'black',
    'clear', 'ready', 'strange', 'happy', 'deep', 'true', 'able', 'southern',
    'terrible', 'silent', 'soft', 'colonial', 'dark', 'hard', 'usual', 'fine',
    'afraid', 'severe', 'single', 'human', 'acute', 'strong', 'thin', 'late',
    'pale', 'dead', 'clinical', 'fresh', 'special', 'contrary', 'bad', 'various',
    'glad', 'difficult', 'liable', 'unable', 'complete', 'natural', 'blue', 'direct',
    'serious', 'heavy', 'simple', 'further', 'ill', 'popular', 'angry', 'dry',
    'low', 'east', 'upper', 'poor', 'similar', 'straight', 'sure', 'easy',
    'chronic', 'economic', 'hot', 'individual', 'quiet', 'handsome', 'western', 'bright',
    'slight', 'royal', 'evident', 'main', 'normal', 'equal', 'plain', 'wide',
    'fibrous', 'wrong', 'ordinary', 'real', 'connective', 'external', 'beautiful', 'industrial',
    'characteristic', 'active', 'northern', 'pleasant', 'rapid', 'multiple', 'superficial', 'adjacent',
    'original', 'private', 'broad', 'constitutional', 'dangerous', 'essential', 'internal', 'particular',
    'rich', 'calm', 'personal', 'sad', 'loose', 'fat', 'gray', 'huge',
    'malignant', 'unknown', 'brilliant', 'weak', 'painful', 'peculiar', 'rare', 'sharp',
    'bald', 'big', 'sovereign', 'democratic', 'grand', 'quick', 'secret', 'social',
    'sore', 'limited', 'opposite', 'familiar', 'mere', 'pacific', 'sudden', 'definite',
    'fourth', 'likely', 'major', 'immense', 'remarkable', 'sorry', 'splendid', 'thick',
    'central', 'prominent', 'regular', 'sufficient', 'warm', 'yellow', 'bare', 'domestic',
    'dull', 'extraordinary', 'muscular', 'tall', 'constant', 'enormous', 'independent', 'powerful',
    'useful', 'extreme', 'innocent', 'alive', 'brown', 'current', 'interesting', 'august',
    'cellular', 'sole', 'worth', 'separate', 'commercial', 'conscious', 'dreadful', 'obvious',
    'previous', 'animated', 'final', 'surgical', 'diffuse', 'green', 'historical', 'interested',
    'slow', 'stern', 'actual', 'ashamed', 'false', 'loud', 'permanent', 'anxious',
    'entire', 'fatal', 'moist', 'charming', 'excellent', 'practical', 'stout', 'clean',
    'empty', 'fond', 'inevitable', 'narrow', 'fifth', 'healthy', 'inner', 'visible',
    'wet', 'famous', 'physical', 'striking', 'electronic', 'gentle', 'raw', 'swollen',
    'immediate', 'smooth', 'stupid', 'absent', 'absolute', 'clever', 'friendly', 'interior',
    'merry', 'successful', 'busy', 'evil', 'fair', 'solemn', 'bacterial', 'capable',
    'delicate', 'diplomatic', 'imperial', 'nervous', 'pure', 'recent', 'religious', 'standard',
    'inflamed', 'intimate', 'nice', 'operative', 'progressive', 'protective', 'sick', 'unpleasant',
    'aware', 'cheerful', 'hollow', 'holy', 'legal', 'revolutionary', 'weary', 'distant',
    'extensive', 'frequent', 'moral', 'overlying', 'sixth', 'ancient', 'eager', 'eastern',
    'elastic', 'fancy', 'irregular', 'mild', 'numerous', 'traumatic', 'double', 'grave',
    'joyful', 'modern', 'profound', 'septic', 'inflammatory', 'noble', 'orderly', 'proper',
    'useless', 'vast', 'abdominal', 'bitter', 'continuous', 'historic', 'owing', 'safe',
    'thy', 'worthy', 'continental', 'international', 'tertiary', 'rough', 'unexpected', 'conservative',
    'daily', 'dense', 'favorite', 'feeble', 'positive', 'proud', 'vascular', 'careful',
    'distinct', 'resolute', 'apparent', 'excessive', 'guilty', 'literary', 'loving', 'rid',
    'satisfactory', 'top', 'cruel', 'incomprehensible', 'intellectual', 'naval', 'solid', 'superior',
    'utter', 'vital', 'cervical', 'financial', 'male', 'peripheral', 'persistent', 'spinal',
    'vigorous', 'artificial', 'grey', 'native', 'perfect', 'serene', 'significant', 'vague',
    'arterial', 'bold', 'correct', 'dirty', 'innumerable', 'liberal', 'mysterious', 'precious',
    'trivial', 'available', 'bony', 'mental', 'senseless', 'specific', 'universal', 'unnatural',
    'wooden', 'awkward', 'exceptional', 'gloomy', 'mad', 'pathological', 'preferred', 'singular',
    'steady', 'unfortunate', 'apt', 'gay', 'mechanical', 'motionless', 'provincial', 'sensitive',
    'sweet', 'total', 'wild', 'cystic', 'dissatisfied', 'divine', 'flat', 'intense',
    'natured', 'spiritual', 'strict', 'unhappy', 'alien', 'anatomical', 'diseased', 'elderly',
    'presidential', 'valuable', 'appropriate', 'confident', 'depressed', 'desperate', 'drunk', 'keen',
    'passionate', 'passive', 'plump', 'principal', 'responsible', 'restless', 'unusual', 'congenital',
    'frank', 'indifferent', 'legislative', 'moderate', 'posterior', 'suitable', 'temporary', 'timid',
    'typical', 'wealthy', 'additional', 'criminal', 'dependent', 'hostile', 'hungry', 'iliac',
    'insignificant', 'lateral', 'lovely', 'mighty', 'peaceful', 'rear', 'rosy', 'swift',
    'tight', 'uncertain', 'unnecessary', 'vain', 'violent', 'wonderful', 'awful', 'curious',
    'gracious', 'judicial', 'lofty', 'manifest', 'minor', 'offensive', 'outer', 'purple',
    'radical', 'reasonable', 'uncommon', 'abnormal', 'abundant', 'agreeable', 'anterior', 'antiseptic',
    'brave', 'coarse', 'collective', 'destructive', 'distal', 'gross', 'infinite', 'net',
    'professional', 'subsequent', 'effective', 'fourteenth', 'horrible', 'indefinite', 'involuntary', 'negative',
    'pink', 'probable', 'spare', 'stable', 'adherent', 'corresponding', 'cunning', 'energetic',
    'eternal', 'exact', 'heroic', 'key',
]

VERBS_SINGULAR = [
    'sees', 'knows', 'takes', 'looks', 'gives', 'makes', 'tells', 'gets',
    'puts', 'understands', 'leaves', 'finds', 'asks', 'helps', 'closes', 'reads',
    'cuts', 'calls', 'turns', 'hears', 'pleases', 'meets', 'brings', 'remembers',
    'passes', 'keeps', 'leads', 'prevents', 'pays', 'explains', 'produces', 'follows',
    'holds', 'misses', 'saves', 'thanks', 'carries', 'sends', 'avoids', 'considers',
    'means', 'breaks', 'crosses', 'imagines', 'marries', 'plays', 'receives', 'allows',
    'expresses', 'tries', 'bears', 'writes', 'reaches', 'forgets', 'proves', 'secures',
    'sheds', 'assumes', 'blames', 'admits', 'forgives', 'serves', 'joins', 'accepts',
    'destroys', 'kills', 'develops', 'draws', 'chooses', 'eats', 'recognizes', 'rides',
    'removes', 'fits', 'raises', 'describes', 'loses', 'watches', 'attains', 'buys',
    'finishes', 'maintains', 'throws', 'extends', 'provides', 'beats', 'mentions', 'polishes',
    'prepares', 'catches', 'establishes', 'captures', 'eases', 'undergoes', 'applies', 'dares',
    'obtains', 'refuses', 'fills', 'matches', 'protects', 'burns', 'heals', 'hides',
    'affects', 'determines', 'restrains', 'covers', 'learns', 'seeks', 'wins', 'observes',
    'realizes', 'recalls', 'confesses', 'discusses', 'grasps', 'sticks', 'unites', 'preserves',
    'stirs', 'arranges', 'distinguishes', 'decides', 'locks', 'resists', 'abandons', 'informs',
    'lifts', 'overcomes', 'spends', 'conceals', 'indicates', 'permits', 'retains', 'seizes',
    'submits', 'treats', 'recovers', 'sells', 'sloughs', 'wears', 'attends', 'compares',
    'damps', 'defends', 'enforces', 'fetches', 'furnishes', 'obeys', 'requires', 'withdraws',
    'discovers', 'renders', 'restores', 'adds', 'endures', 'fixes', 'manages', 'performs',
    'teaches', 'contains', 'distributes', 'punishes', 'declares', 'proposes', 'repeats', 'selects',
    'assures', 'collects', 'enables', 'enjoys', 'occupies', 'tears', 'folds', 'induces',
    'introduces', 'pulls', 'accompanies', 'bites', 'examines', 'files', 'involves', 'handles',
    'justifies', 'pardons', 'perishes', 'poses', 'reduces', 'strengthens', 'affords', 'approves',
    'deprives', 'encourages', 'fulfills', 'improves', 'operates', 'overthrows', 'persists', 'picks',
    'pours', 'refrains', 'relieves', 'advises', 'announces', 'attracts', 'behaves', 'complies',
    'consults', 'diminishes', 'executes', 'gathers', 'inquires', 'manufactures', 'promotes', 'pushes',
    'replaces', 'sobs', 'acquires', 'adopts', 'awaits', 'bends', 'invades', 'knocks',
    'recurs', 'solves', 'alters', 'boils', 'builds', 'commits', 'creates', 'disperses',
    'embraces', 'employs', 'erects', 'hangs', 'mounts', 'reflects', 'wrungs', 'accomplishes',
    'arouses', 'conceives', 'confirms', 'convinces', 'exposes', 'regulates', 'represents', 'succeeds',
    'undertakes', 'blunts', 'communicates', 'corresponds', 'disturbs', 'heeds', 'reveals', 'satisfies',
    'shoots', 'sustains', 'amuses', 'confers', 'deduces', 'dines', 'divides', 'donates',
    'enlarges', 'ensures', 'excludes', 'governs', 'hinders', 'opposes', 'perceives', 'persuades',
    'prompts', 'quits', 'regains', 'renews', 'resolves', 'screams', 'shakes', 'simulates',
    'softens', 'suppresses', 'transmits', 'assists', 'contradicts', 'conveys', 'deceives', 'defines',
    'disposes', 'earns', 'pierces', 'presumes', 'pursues', 'sinks', 'swallows', 'apologizes',
    'appreciates', 'confines', 'delivers', 'devotes', 'elects', 'entertains', 'exploits', 'forges',
    'implicates', 'implies', 'impresses', 'negotiates', 'overtakes', 'succumbs', 'swears', 'touts',
    'treads', 'averts', 'betrays', 'commences', 'condemns', 'differentiates', 'enacts', 'fetes',
    'flourishes', 'forbids', 'inspects', 'lends', 'offsets', 'penetrates', 'reins', 'relies',
    'resumes', 'reverses', 'safeguards', 'snuffs', 'stokes', 'subsides', 'sways', 'warns',
    'ascertains', 'blesses', 'breathes', 'combines', 'comments', 'converts', 'denies', 'descends',
    'disguises', 'frightens', 'hastens', 'invents', 'moans', 'reassures', 'renounces', 'repays',
    'shudders', 'spoils', 'taps', 'threatens', 'urges', 'wanders', 'worries', 'abolishes',
    'compels', 'comprehends', 'concludes', 'conquers', 'contemplates', 'contributes', 'devises', 'dilates',
    'drowns', 'engages', 'facilitates', 'forfeits', 'greets', 'identifies', 'illustrates', 'infects',
    'interrupts', 'invites', 'prevails', 'pronounces', 'recommends', 'refers', 'reminds', 'responds',
    'snaps', 'spells', 'withstands', 'adheres', 'administers', 'appoints', 'assembles', 'asserts',
    'buries', 'counteracts', 'cripples', 'demonstrates', 'detains', 'disappoints', 'endangers', 'exceeds',
    'exerts', 'extracts', 'fathoms', 'imposes', 'inspires', 'jacks', 'lashes', 'lures',
    'multiplies', 'obliges', 'pillages', 'pretends', 'redresses', 'rejoins', 'represses', 'rouses',
    'snatches', 'solicits', 'accumulates', 'achieves', 'admires', 'attaches', 'byes', 'calculates',
    'consoles', 'criticizes', 'denotes', 'discloses', 'dispenses', 'drums', 'excites', 'flatters',
    'imitates', 'indulges', 'inflicts', 'inherits', 'nourishes', 'organizes', 'outflanks', 'preaches',
    'precedes', 'purifies', 'rams', 'ratifies', 'registers', 'sparks', 'stifles', 'summons',
    'tailors', 'weakens', 'allays', 'analyzes', 'awakens', 'bestows', 'borrows', 'celebrates',
    'cherishes', 'confounds', 'constructs', 'diverts', 'dominates', 'entreats', 'expands', 'fosters',
    'gouges', 'impairs', 'inhibits', 'injures', 'meddles', 'modifies', 'offends', 'omits',
    'postpones', 'prescribes', 'procures', 'prolongs', 'reconciles', 'repels', 'retracts', 'shoves',
    'snubs', 'stanches', 'steals', 'stimulates', 'straightens', 'supervises', 'suspends', 'terminates',
    'undermines', 'wrings', 'abates', 'affirms', 'assigns', 'bewares', 'cleanses', 'compresses',
    'concentrates', 'coordinates', 'cultivates', 'curls',
]

VERBS_PLURAL = [
    'see', 'know', 'take', 'look', 'give', 'make', 'tell', 'get',
    'put', 'understand', 'leave', 'find', 'ask', 'help', 'close', 'read',
    'cut', 'call', 'turn', 'hear', 'please', 'meet', 'bring', 'remember',
    'pass', 'keep', 'lead', 'prevent', 'pay', 'explain', 'produce', 'follow',
    'hold', 'miss', 'save', 'thank', 'carry', 'send', 'avoid', 'consider',
    'mean', 'break', 'cross', 'imagine', 'marry', 'play', 'receive', 'allow',
    'express', 'try', 'bear', 'write', 'reach', 'forget', 'prove', 'secure',
    'shed', 'assume', 'blame', 'admit', 'forgive', 'serve', 'join', 'accept',
    'destroy', 'kill', 'develop', 'draw', 'choose', 'eat', 'recognize', 'ride',
    'remove', 'fit', 'raise', 'describe', 'lose', 'watch', 'attain', 'buy',
    'finish', 'maintain', 'throw', 'extend', 'provide', 'beat', 'mention', 'polish',
    'prepare', 'catch', 'establish', 'capture', 'ease', 'undergo', 'apply', 'dare',
    'obtain', 'refuse', 'fill', 'match', 'protect', 'burn', 'heal', 'hide',
    'affect', 'determine', 'restrain', 'cover', 'learn', 'seek', 'win', 'observe',
    'realize', 'recall', 'confess', 'discuss', 'grasp', 'stick', 'unite', 'preserve',
    'stir', 'arrange', 'distinguish', 'decide', 'lock', 'resist', 'abandon', 'inform',
    'lift', 'overcome', 'spend', 'conceal', 'indicate', 'permit', 'retain', 'seize',
    'submit', 'treat', 'recover', 'sell', 'slough', 'wear', 'attend', 'compare',
    'damp', 'defend', 'enforce', 'fetch', 'furnish', 'obey', 'require', 'withdraw',
    'discover', 'render', 'restore', 'add', 'endure', 'fix', 'manage', 'perform',
    'teach', 'contain', 'distribute', 'punish', 'declare', 'propose', 'repeat', 'select',
    'assure', 'collect', 'enable', 'enjoy', 'occupy', 'tear', 'fold', 'induce',
    'introduce', 'pull', 'accompany', 'bite', 'examine', 'file', 'involve', 'handle',
    'justify', 'pardon', 'perish', 'pose', 'reduce', 'strengthen', 'afford', 'approve',
    'deprive', 'encourage', 'fulfill', 'improve', 'operate', 'overthrow', 'persist', 'pick',
    'pour', 'refrain', 'relieve', 'advise', 'announce', 'attract', 'behave', 'comply',
    'consult', 'diminish', 'execute', 'gather', 'inquire', 'manufacture', 'promote', 'push',
    'replace', 'sob', 'acquire', 'adopt', 'await', 'bend', 'invade', 'knock',
    'recur', 'solve', 'alter', 'boil', 'build', 'commit', 'create', 'disperse',
    'embrace', 'employ', 'erect', 'hang', 'mount', 'reflect', 'wrung', 'accomplish',
    'arouse', 'conceive', 'confirm', 'convince', 'expose', 'regulate', 'represent', 'succeed',
    'undertake', 'blunt', 'communicate', 'correspond', 'disturb', 'heed', 'reveal', 'satisfy',
    'shoot', 'sustain', 'amuse', 'confer', 'deduce', 'dine', 'divide', 'donate',
    'enlarge', 'ensure', 'exclude', 'govern', 'hinder', 'oppose', 'perceive', 'persuade',
    'prompt', 'quit', 'regain', 'renew', 'resolve', 'scream', 'shake', 'simulate',
    'soften', 'suppress', 'transmit', 'assist', 'contradict', 'convey', 'deceive', 'define',
    'dispose', 'earn', 'pierce', 'presume', 'pursue', 'sink', 'swallow', 'apologize',
    'appreciate', 'confine', 'deliver', 'devote', 'elect', 'entertain', 'exploit', 'forge',
    'implicate', 'imply', 'impress', 'negotiate', 'overtake', 'succumb', 'swear', 'tout',
    'tread', 'avert', 'betray', 'commence', 'condemn', 'differentiate', 'enact', 'fete',
    'flourish', 'forbid', 'inspect', 'lend', 'offset', 'penetrate', 'rein', 'rely',
    'resume', 'reverse', 'safeguard', 'snuff', 'stoke', 'subside', 'sway', 'warn',
    'ascertain', 'bless', 'breathe', 'combine', 'comment', 'convert', 'deny', 'descend',
    'disguise', 'frighten', 'hasten', 'invent', 'moan', 'reassure', 'renounce', 'repay',
    'shudder', 'spoil', 'tap', 'threaten', 'urge', 'wander', 'worry', 'abolish',
    'compel', 'comprehend', 'conclude', 'conquer', 'contemplate', 'contribute', 'devise', 'dilate',
    'drown', 'engage', 'facilitate', 'forfeit', 'greet', 'identify', 'illustrate', 'infect',
    'interrupt', 'invite', 'prevail', 'pronounce', 'recommend', 'refer', 'remind', 'respond',
    'snap', 'spell', 'withstand', 'adhere', 'administer', 'appoint', 'assemble', 'assert',
    'bury', 'counteract', 'cripple', 'demonstrate', 'detain', 'disappoint', 'endanger', 'exceed',
    'exert', 'extract', 'fathom', 'impose', 'inspire', 'jack', 'lash', 'lure',
    'multiply', 'oblige', 'pillage', 'pretend', 'redress', 'rejoin', 'repress', 'rouse',
    'snatch', 'solicit', 'accumulate', 'achieve', 'admire', 'attach', 'bye', 'calculate',
    'console', 'criticize', 'denote', 'disclose', 'dispense', 'drum', 'excite', 'flatter',
    'imitate', 'indulge', 'inflict', 'inherit', 'nourish', 'organize', 'outflank', 'preach',
    'precede', 'purify', 'ram', 'ratify', 'register', 'spark', 'stifle', 'summon',
    'tailor', 'weaken', 'allay', 'analyze', 'awaken', 'bestow', 'borrow', 'celebrate',
    'cherish', 'confound', 'construct', 'divert', 'dominate', 'entreat', 'expand', 'foster',
    'gouge', 'impair', 'inhibit', 'injure', 'meddle', 'modify', 'offend', 'omit',
    'postpone', 'prescribe', 'procure', 'prolong', 'reconcile', 'repel', 'retract', 'shove',
    'snub', 'stanch', 'steal', 'stimulate', 'straighten', 'supervise', 'suspend', 'terminate',
    'undermine', 'wring', 'abate', 'affirm', 'assign', 'beware', 'cleanse', 'compress',
    'concentrate', 'coordinate', 'cultivate', 'curl',
]

TEMPLATES = [
    "the {adj} {noun} {verb_s} the {adj} {noun} .",
    "{name} {verb_s} the {adj} {noun} .",
    "the {noun} is {adj} .",
    "{name} gives the {adj} {noun} to {name} .",
    "{name} and {name} {verb_p} the {noun} .",
    "the {adj} {noun} {verb_s} {name} .",
]


def grammar_spec() -> Dict[str, object]:
    return {
        "names": NAMES,
        "nouns": NOUNS,
        "adjectives": ADJECTIVES,
        "verbs_singular": VERBS_SINGULAR,
        "verbs_plural": VERBS_PLURAL,
        "templates": TEMPLATES,
    }


def vocabulary_words() -> List[str]:
    return sorted(set(
        NAMES + NOUNS + ADJECTIVES + VERBS_SINGULAR + VERBS_PLURAL
        + ["the", "is", "gives", "to", "and", "."]
    ))


def make_sentence(rng: random.Random) -> str:
    template = rng.choice(TEMPLATES)
    line = template
    while "{" in line:
        start = line.index("{")
        end = line.index("}", start)
        placeholder = line[start + 1:end]
        word = {
            "adj": lambda: rng.choice(ADJECTIVES),
            "noun": lambda: rng.choice(NOUNS),
            "name": lambda: rng.choice(NAMES),
            "verb_s": lambda: rng.choice(VERBS_SINGULAR),
            "verb_p": lambda: rng.choice(VERBS_PLURAL),
        }[placeholder]()
        line = line[:start] + word + line[end + 1:]
    return line


def format_answer(total: int, reverse_answer: bool) -> str:
    text = str(total)
    return text[::-1] if reverse_answer else text


def read_answer(written: str, reverse_answer: bool) -> str:
    return written[::-1] if reverse_answer else written


def make_arithmetic(a: int, b: int, reverse_answer: bool = False) -> str:
    return f"{a} + {b} = {format_answer(a + b, reverse_answer)}"


def split_pairs(
    max_operand: int,
    train_frac: float,
    val_frac: float,
    seed: int,
) -> Dict[str, List[Tuple[int, int]]]:
    pairs = [(a, b) for a in range(max_operand + 1) for b in range(max_operand + 1)]
    rng = random.Random(seed)
    rng.shuffle(pairs)

    n_total = len(pairs)
    n_train = int(round(train_frac * n_total))
    n_val = int(round(val_frac * n_total))
    if n_total - n_train - n_val <= 0:
        raise ValueError("pair split leaves no pairs for the test corpus")

    return {
        "train": pairs[:n_train],
        "val": pairs[n_train:n_train + n_val],
        "test": pairs[n_train + n_val:],
    }


def build_corpus_text(
    sentence_lines: int,
    pairs: Sequence[Tuple[int, int]],
    repeats: int,
    rng: random.Random,
    reverse_answer: bool = False,
    extra_lines: Sequence[str] = (),
) -> str:
    lines = [make_sentence(rng) for _ in range(sentence_lines)]
    for _ in range(repeats):
        lines.extend(make_arithmetic(a, b, reverse_answer) for a, b in pairs)
    lines.extend(extra_lines)

    rng.shuffle(lines)
    return "\n".join(lines) + "\n"


@dataclass
class CorpusStats:
    split: str
    path: Path
    characters: int
    lines: int
    sentence_lines: int
    arithmetic_lines: int
    pairs: int
    fact_lines: int = 0


def generate_corpus(
    cfg: Config,
    force: bool = False,
    extra_lines: Optional[Dict[str, Sequence[str]]] = None,
) -> Dict[str, CorpusStats]:
    corpus_cfg = cfg.data.corpus
    directory = Path(corpus_cfg.dir)

    train_path = directory / "train.txt"
    if train_path.exists() and not force:
        logger.info(f"corpus already exists: {directory}  (use --force to regenerate)")
        return read_corpus_stats(cfg)

    directory.mkdir(parents=True, exist_ok=True)

    pairs_by_split = split_pairs(
        max_operand=corpus_cfg.max_operand,
        train_frac=corpus_cfg.pair_split.train,
        val_frac=corpus_cfg.pair_split.val,
        seed=cfg.seed,
    )

    sentence_counts = {
        "train": corpus_cfg.sentence_lines,
        "val": max(1, int(corpus_cfg.sentence_lines * corpus_cfg.val_test_fraction)),
        "test": max(1, int(corpus_cfg.sentence_lines * corpus_cfg.val_test_fraction)),
    }

    stats: Dict[str, CorpusStats] = {}
    for split in SPLITS:
        rng = random.Random(cfg.seed + SPLITS.index(split))
        pairs = pairs_by_split[split]
        repeats = corpus_cfg.arithmetic_repeats if split == "train" else 1

        added = list((extra_lines or {}).get(split, ()))
        text = build_corpus_text(sentence_counts[split], pairs, repeats, rng,
                                 corpus_cfg.reverse_answer, added)
        path = directory / f"{split}.txt"
        path.write_text(text, encoding="utf-8")

        stats[split] = CorpusStats(
            split=split,
            path=path,
            characters=len(text),
            lines=text.count("\n"),
            sentence_lines=sentence_counts[split],
            arithmetic_lines=len(pairs) * repeats,
            pairs=len(pairs),
            fact_lines=len(added),
        )

    (directory / "grammar.json").write_text(
        json.dumps(grammar_spec(), indent=2), encoding="utf-8"
    )
    (directory / "corpus_meta.json").write_text(
        json.dumps({"reverse_answer": corpus_cfg.reverse_answer,
                    "max_operand": corpus_cfg.max_operand,
                    "arithmetic_repeats": corpus_cfg.arithmetic_repeats,
                    "sentence_lines": corpus_cfg.sentence_lines}, indent=2),
        encoding="utf-8",
    )
    (directory / "arithmetic_pairs.json").write_text(
        json.dumps({k: [list(p) for p in v] for k, v in pairs_by_split.items()}, indent=2),
        encoding="utf-8",
    )

    _log_summary(cfg, stats, pairs_by_split)
    return stats


def read_corpus_stats(cfg: Config) -> Dict[str, CorpusStats]:
    directory = Path(cfg.data.corpus.dir)
    pairs_by_split = load_arithmetic_pairs(directory)
    stats: Dict[str, CorpusStats] = {}
    for split in SPLITS:
        path = directory / f"{split}.txt"
        text = path.read_text(encoding="utf-8")
        stats[split] = CorpusStats(
            split=split,
            path=path,
            characters=len(text),
            lines=text.count("\n"),
            sentence_lines=-1,
            arithmetic_lines=-1,
            pairs=len(pairs_by_split[split]),
        )
    return stats


def load_arithmetic_pairs(directory: str | Path) -> Dict[str, List[Tuple[int, int]]]:
    path = Path(directory) / "arithmetic_pairs.json"
    if not path.exists():
        raise FileNotFoundError(
            f"{path} not found. Generate the corpus first:\n"
            f"  python scripts/generate_corpus.py"
        )
    raw = json.loads(path.read_text(encoding="utf-8"))
    return {split: [tuple(pair) for pair in pairs] for split, pairs in raw.items()}


def load_grammar(directory: str | Path) -> Dict[str, object]:
    path = Path(directory) / "grammar.json"
    if not path.exists():
        raise FileNotFoundError(f"{path} not found. Run scripts/generate_corpus.py")
    return json.loads(path.read_text(encoding="utf-8"))


def read_corpus(directory: str | Path, split: str) -> str:
    path = Path(directory) / f"{split}.txt"
    if not path.exists():
        raise FileNotFoundError(
            f"corpus not found: {path}\n"
            f"Generate it first:  python scripts/generate_corpus.py"
        )
    return path.read_text(encoding="utf-8")


def _log_summary(cfg, stats, pairs_by_split) -> None:
    logger.info(section("CORPUS GENERATED"))
    logger.info(f"directory : {cfg.data.corpus.dir}")
    logger.info("")
    header = (f"{'split':<8}{'characters':>12}{'lines':>10}{'sentences':>12}"
              f"{'sums':>8}{'facts':>8}{'pairs':>8}")
    logger.info(header)
    logger.info("-" * len(header))
    for split in SPLITS:
        st = stats[split]
        logger.info(f"{split:<8}{st.characters:>12,}{st.lines:>10,}"
                    f"{st.sentence_lines:>12,}{st.arithmetic_lines:>8,}"
                    f"{st.fact_lines:>8,}{st.pairs:>8,}")
    logger.info("")
    logger.info(f"Operand pairs are disjoint across splits: "
                f"{len(pairs_by_split['train'])} train / "
                f"{len(pairs_by_split['val'])} val / "
                f"{len(pairs_by_split['test'])} test, "
                f"out of {(cfg.data.corpus.max_operand + 1) ** 2} possible.")
    logger.info("A sum in the test corpus never appears in the training corpus.")
    logger.info("")
    logger.info("First lines of the training corpus:")
    for line in read_corpus(cfg.data.corpus.dir, "train").split("\n")[:8]:
        logger.info(f"  {line}")


def main(argv: List[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate the Ored.ai text corpus.")
    parser.add_argument("--config", default="configs/char_transformer.yaml")
    parser.add_argument("--set", dest="overrides", action="append", default=[],
                        metavar="KEY=VALUE")
    parser.add_argument("--force", action="store_true", help="regenerate even if it exists")
    args = parser.parse_args(argv)

    cfg = load_config(args.config, args.overrides)
    generate_corpus(cfg, force=args.force)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
